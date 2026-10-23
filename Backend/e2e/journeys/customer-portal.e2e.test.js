import { describe, expect, it } from 'vitest';
import { TEST_CARDS } from '@estateops/mock-providers';
import { eventually } from '../support/http.js';
import { PASSWORD } from '../support/world.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';
const P = '/api/v1/portal';

async function portalWorld() {
  const { w } = ctx;
  const t = await w.tenantWithStaff();
  const s = await w.seedSales(t.owner, { price: 300_000_00, downPct: 50, installments: 2 });
  const booking = await w.book(t.owner, s);
  const me = await w.portalCustomer(t.owner, t, s.customer);
  return { w, t, s, booking, me };
}

describe('the customer portal', () => {
  it('creates the customer’s login from the management side: invite email, set password, sign in', async () => {
    const { w, t, s, me } = await portalWorld();
    expect(me.session.customer).toMatchObject({ email: s.customer.email });
    const access = await t.owner.get(`${A}/customers/${s.customer.id}/portal-access`);
    expect(access.status).toBe('active');
    // the wrong password is refused, with the same answer as an unknown account
    const bad = await w.anon.raw('POST', `${P}/auth/login`, {
      body: { tenant: t.slug, email: s.customer.email, password: 'wrong-Password-1' },
    });
    const unknown = await w.anon.raw('POST', `${P}/auth/login`, {
      body: { tenant: t.slug, email: 'nobody@x.test', password: 'wrong-Password-1' },
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
  });

  it('shows only the customer’s own properties, with figures that match the staff view', async () => {
    const { t, s, booking, me } = await portalWorld();
    const props = (await me.api.get(`${P}/properties`)).data;
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ id: booking.id, total_price: 300_000_00 });
    const staffView = await t.owner.get(`${A}/bookings/${booking.id}`);
    expect(props[0].pending_amount).toBe(staffView.pending_amount);
    const invoices = (await me.api.get(`${P}/properties/${booking.id}/invoices`)).data;
    expect(invoices).toHaveLength(3);
    expect(invoices[0].payable).toBe(true);

    // another buyer of the same developer sees nothing of it, even by id
    const s2 = await ctx.w.seedSales(t.owner);
    await ctx.w.book(t.owner, s2);
    const other = await ctx.w.portalCustomer(t.owner, t, s2.customer);
    expect((await other.api.get(`${P}/properties`)).data.every((p) => p.id !== booking.id)).toBe(
      true,
    );
    expect((await other.api.fails('GET', `${P}/properties/${booking.id}`)).status).toBe(404);
    expect((await other.api.fails('GET', `${P}/properties/${booking.id}/invoices`)).status).toBe(
      404,
    );
    expect(s.customer.id).not.toBe(s2.customer.id);
  });

  it('keeps staff and customer tokens apart', async () => {
    const { t, me } = await portalWorld();
    expect([401, 403]).toContain((await t.owner.fails('GET', `${P}/properties`)).status);
    expect([401, 403]).toContain((await me.api.fails('GET', `${A}/customers`)).status);
    expect((await ctx.w.anon.fails('GET', `${P}/properties`)).status).toBe(401);
  });

  it('pays an invoice with a new card on Stripe, saving it; then pays the next with the saved card', async () => {
    const { w, t, booking, me } = await portalWorld();
    const [down, first] = (await me.api.get(`${P}/properties/${booking.id}/invoices`)).data;
    const checkout = await me.api.post(`${P}/invoices/${down.id}/checkout-session`, {
      save_card: true,
    });
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    const result = await eventually(
      async () => {
        const r = await me.api.get(`${P}/checkout-sessions/${checkout.checkout_id}`);
        return r.status !== 'open' ? r : null;
      },
      { what: 'checkout settled' },
    );
    expect(result.transaction.status).toBe('succeeded');

    const cards = (await me.api.get(`${P}/payment-methods`)).data;
    expect(cards).toHaveLength(1);
    expect(cards[0].is_active).toBe(true);

    const tx = await me.api.post(`${P}/invoices/${first.id}/charge-saved-card`, {});
    expect(tx.status).toBe('succeeded');
    const listed = (await me.api.get(`${P}/transactions`, { booking_id: booking.id })).data;
    expect(listed).toHaveLength(2);
    // the management portal sees the same transactions
    expect((await t.owner.get(`${A}/transactions`, { booking_id: booking.id })).data).toHaveLength(
      2,
    );
  });

  it('keeps several cards with one active, and refuses to touch another customer’s card', async () => {
    const { w, t, me } = await portalWorld();
    for (const number of [TEST_CARDS.VISA, TEST_CARDS.MASTERCARD]) {
      const setup = await me.api.post(`${P}/payment-methods/setup-session`, {});
      await w.payOnStripe(setup, number);
      await eventually(
        async () =>
          (await me.api.get(`${P}/payment-methods`)).data.length ===
          (number === TEST_CARDS.VISA ? 1 : 2),
        { what: 'card saved' },
      );
    }
    const cards = (await me.api.get(`${P}/payment-methods`)).data;
    expect(cards.filter((c) => c.is_active)).toHaveLength(1);
    const inactive = cards.find((c) => !c.is_active);
    await me.api.post(`${P}/payment-methods/${inactive.id}/activate`, {});
    expect(
      (await me.api.get(`${P}/payment-methods`)).data.filter((c) => c.is_active).map((c) => c.id),
    ).toEqual([inactive.id]);

    const s2 = await w.seedSales(t.owner);
    await w.book(t.owner, s2);
    const other = await w.portalCustomer(t.owner, t, s2.customer);
    expect(
      (await other.api.fails('POST', `${P}/payment-methods/${inactive.id}/activate`, {})).status,
    ).toBe(404);
    expect((await other.api.fails('DELETE', `${P}/payment-methods/${inactive.id}`)).status).toBe(
      404,
    );
    expect((await other.api.get(`${P}/payment-methods`)).data).toHaveLength(0);

    await me.api.delete(`${P}/payment-methods/${inactive.id}`);
    const left = (await me.api.get(`${P}/payment-methods`)).data;
    expect(left).toHaveLength(1);
    expect(left[0].is_active).toBe(true);
  });

  it('will not let a customer pay another customer’s invoice', async () => {
    const { w, t, booking } = await portalWorld();
    const mine = await t.owner.get(`${A}/installments`, { booking_id: booking.id });
    const s2 = await w.seedSales(t.owner);
    await w.book(t.owner, s2);
    const other = await w.portalCustomer(t.owner, t, s2.customer);
    const out = await other.api.fails(
      'POST',
      `${P}/invoices/${mine.data[0].id}/checkout-session`,
      {},
    );
    expect(out.status).toBe(404);
  });

  it('resets a forgotten password from the emailed link, ends old sessions, and reveals nothing about unknown emails', async () => {
    const { w, t, s, me } = await portalWorld();
    const before = ctx.stack.mails.length;
    const same = await w.anon.post(`${P}/auth/forgot-password`, {
      tenant: t.slug,
      email: 'ghost@nowhere.test',
    });
    const real = await w.anon.post(`${P}/auth/forgot-password`, {
      tenant: t.slug,
      email: s.customer.email,
    });
    expect(same).toEqual(real);
    const mail = await eventually(
      () =>
        ctx.stack.mails
          .slice(before)
          .find((m) => m.to === s.customer.email && /reset-password/.test(m.text)),
      { what: 'reset email' },
    );
    expect(ctx.stack.mails.slice(before).some((m) => m.to === 'ghost@nowhere.test')).toBe(false);
    const token = new URL(/https?:\/\/\S+reset-password\?\S+/.exec(mail.text)[0]).searchParams.get(
      'token',
    );
    await w.anon.post(`${P}/auth/set-password`, { token, password: 'Another-pass-77' });
    // the link works once
    expect(
      (await w.anon.fails('POST', `${P}/auth/set-password`, { token, password: 'Third-pass-88' }))
        .status,
    ).toBeGreaterThanOrEqual(400);
    const login = await w.anon.post(`${P}/auth/login`, {
      tenant: t.slug,
      email: s.customer.email,
      password: 'Another-pass-77',
    });
    expect(login.access_token).toBeTruthy();
    expect(
      (
        await w.anon.fails('POST', `${P}/auth/login`, {
          tenant: t.slug,
          email: s.customer.email,
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(me.session.refresh_token).toBeTruthy();
    const refreshOld = await w.anon.fails('POST', `${P}/auth/refresh`, {
      refresh_token: me.session.refresh_token,
    });
    expect(refreshOld.status).toBe(401);
  });

  it('changes the password while signed in and then asks for the new one', async () => {
    const { w, t, s, me } = await portalWorld();
    await me.api.post(`${P}/auth/change-password`, {
      current_password: PASSWORD,
      new_password: 'Changed-pass-55',
    });
    expect(
      (
        await w.anon.fails('POST', `${P}/auth/login`, {
          tenant: t.slug,
          email: s.customer.email,
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await w.anon.post(`${P}/auth/login`, {
          tenant: t.slug,
          email: s.customer.email,
          password: 'Changed-pass-55',
        })
      ).access_token,
    ).toBeTruthy();
    expect(
      (
        await me.api.fails('POST', `${P}/auth/change-password`, {
          current_password: 'nope-nope-1',
          new_password: 'Whatever-12345',
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it('lets the customer contact support, and staff answer', async () => {
    const { t, booking, me } = await portalWorld();
    const request = await me.api.post(`${P}/support-requests`, {
      subject: 'Receipt copy',
      message: 'Please resend my receipt',
      booking_id: booking.id,
    });
    expect(request.status).toBe('open');
    const queue = await eventually(
      async () => {
        const q = await t.owner.get(`${A}/support-requests`);
        return q.data.find((r) => r.id === request.id);
      },
      { what: 'request in the staff queue' },
    );
    expect(queue.subject).toBe('Receipt copy');
    await t.owner.post(`${A}/support-requests/${request.id}/messages`, {
      message: 'Sent to your email.',
    });
    const thread = await me.api.get(`${P}/support-requests/${request.id}`);
    expect(thread.messages.map((m) => m.author_kind)).toEqual(['customer', 'staff']);
    await me.api.post(`${P}/support-requests/${request.id}/messages`, { message: 'Thank you' });
    expect((await me.api.get(`${P}/support-requests/${request.id}`)).messages).toHaveLength(3);
  });
});
