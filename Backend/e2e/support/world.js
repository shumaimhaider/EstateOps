import { createTotp } from '../../services/identity/src/auth/infrastructure/totp.js';
import { SECRETS } from './stack.js';
import { createClient, eventually } from './http.js';

const ADMIN = '/api/v1/admin';
const PORTAL = '/api/v1/portal';
const totp = createTotp();
let counter = 0;
export const unique = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;
export const PASSWORD = 'Str0ng-pass-e2e';

/** Everything a journey needs from a running stack, built on the public API only. */
export function createWorld(stack) {
  const anon = createClient(stack.gatewayUrl);

  /** Creates a tenant through the internal bootstrap route and returns its owner credentials. */
  async function createTenant({
    slug = unique('t'),
    currency = 'PKR',
    locale = 'en-PK',
    areaUnit = 'marla',
  } = {}) {
    const internal = createClient(stack.urls.identity);
    const res = await internal.raw('POST', '/internal/tenants', {
      headers: {
        'x-internal-token': SECRETS.internalToken,
        'x-bootstrap-token': SECRETS.bootstrapToken,
      },
      body: {
        slug,
        name: `Developer ${slug}`,
        currency,
        locale,
        time_zone: 'Asia/Karachi',
        area_unit: areaUnit,
        owner: { email: `owner@${slug}.e2e.test`, name: 'Olivia Owner', password: PASSWORD },
      },
    });
    const body = await res.json();
    if (res.status !== 201)
      throw new Error(`tenant bootstrap failed: ${res.status} ${JSON.stringify(body)}`);
    return {
      slug,
      tenantId: body.tenant.id,
      ownerEmail: `owner@${slug}.e2e.test`,
      ownerSecret: body.owner.totp_secret,
      currency,
    };
  }

  /** Two-step staff sign-in through the gateway. */
  async function staffSession(email, secret, password = PASSWORD) {
    const challenge = await anon.post(`${ADMIN}/auth/login`, { email, password });
    const session = await anon.post(`${ADMIN}/auth/2fa`, {
      mfa_token: challenge.mfa_token,
      code: totp.code(secret),
    });
    const api = createClient(stack.gatewayUrl, { token: session.access_token });
    return { api, session, refreshToken: session.refresh_token };
  }

  /** A tenant with an owner session and one staff member per requested role. */
  async function tenantWithStaff({ roles = ['finance', 'sales_agent'], ...tenantOptions } = {}) {
    const tenant = await createTenant(tenantOptions);
    const owner = await staffSession(tenant.ownerEmail, tenant.ownerSecret);
    const staff = {};
    const logins = {};
    for (const role of roles) {
      const email = `${role}@${tenant.slug}.e2e.test`;
      const made = await owner.api.post(`${ADMIN}/users`, {
        email,
        name: `${role} person`,
        role,
        password: PASSWORD,
      });
      staff[role] = (await staffSession(email, made.totp_secret)).api;
      logins[role] = { email, secret: made.totp_secret };
    }
    return { ...tenant, owner: owner.api, staff, logins };
  }

  /** Inventory, a plan, a customer and a unit, all through the API. */
  async function seedSales(
    owner,
    {
      price = 1_200_000_00,
      downPct = 20,
      installments = 4,
      unitNo = unique('U-'),
      kind = 'plot',
      email = `${unique('buyer')}@buyers.e2e.test`,
    } = {},
  ) {
    const project = await owner.post(`${ADMIN}/projects`, {
      name: unique('Project '),
      kind: 'plot_society',
      location: 'Lahore',
    });
    const unit = await owner.post(`${ADMIN}/units`, {
      project_id: project.id,
      unit_no: unitNo,
      kind,
      area_value: 10,
      area_unit: 'marla',
      list_price: price,
      currency: 'PKR',
    });
    const plan = await owner.post(`${ADMIN}/payment-plans`, {
      name: unique('Plan '),
      down_pct: downPct,
      installment_count: installments,
    });
    const customer = await owner.post(`${ADMIN}/customers`, {
      full_name: 'Bilal Buyer',
      email,
      phone: '+92 300 0000000',
      city: 'Lahore',
      id_number: '35202-1234567-1',
    });
    return { project, unit, plan, customer };
  }

  /** Books the unit and waits until the schedule exists (the saga has settled). `bookedAt` backdates it. */
  async function book(owner, { unit, customer, plan }, { bookedAt } = {}) {
    // the unit, plan and customer reach sales/billing by events, so the request may need a moment
    const booking = await eventually(
      async () => {
        try {
          return await owner.post(`${ADMIN}/bookings`, {
            unit_id: unit.id,
            customer_id: customer.id,
            plan_id: plan.id,
            ...(bookedAt && { booked_at: bookedAt }),
          });
        } catch (error) {
          if (error.status === 404 || error.status === 409 || error.status === 422) return null;
          throw error;
        }
      },
      { what: 'booking accepted' },
    );
    const settled = await eventually(
      async () => {
        const b = await owner.get(`${ADMIN}/bookings/${booking.id}`);
        return b.status === 'active' ? b : null;
      },
      { what: 'booking active' },
    );
    return settled;
  }

  const invoicesOf = async (api, bookingId) =>
    (
      await api.get(`${ADMIN}/installments`, {
        booking_id: bookingId,
        limit: '100',
        sort: 'due_date:asc',
      })
    ).data;

  /** The customer's portal sign-in: waits for the invite email, sets a password, signs in. */
  async function portalCustomer(owner, tenant, customer) {
    const mail = await eventually(
      () => stack.mails.find((m) => m.to === customer.email && /set-password/.test(m.text ?? '')),
      { what: `invite email for ${customer.email}` },
    );
    const token = new URL(/https?:\/\/\S+set-password\?\S+/.exec(mail.text)[0]).searchParams.get(
      'token',
    );
    await anon.post(`${PORTAL}/auth/set-password`, { token, password: PASSWORD });
    const session = await anon.post(`${PORTAL}/auth/login`, {
      tenant: tenant.slug,
      email: customer.email,
      password: PASSWORD,
    });
    return { api: createClient(stack.gatewayUrl, { token: session.access_token }), session };
  }

  /** What the shopper does on Stripe's page: types a card into the embedded form. */
  async function payOnStripe(checkout, number, { expYear = new Date().getFullYear() + 2 } = {}) {
    const sessionId = checkout.client_secret.split('_secret_')[0];
    const res = await fetch(`${stack.stripe.url}/_mock/checkout-sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card: { number, exp_month: 12, exp_year: expYear, cvc: '123' } }),
    });
    return { status: res.status, body: await res.json() };
  }

  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const sweep = async () => {
    const res = await fetch(`${stack.urls.billing}/internal/jobs/sweep`, {
      method: 'POST',
      headers: { 'x-internal-token': SECRETS.internalToken, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`sweep failed ${res.status}`);
    return res.json();
  };

  return {
    daysAgo,
    sweep,
    anon,
    ADMIN,
    PORTAL,
    createTenant,
    staffSession,
    tenantWithStaff,
    seedSales,
    book,
    invoicesOf,
    portalCustomer,
    payOnStripe,
  };
}
