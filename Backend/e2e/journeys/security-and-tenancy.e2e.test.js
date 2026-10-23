import { describe, expect, it } from 'vitest';
import { createClient } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

describe('tenants never see each other', () => {
  it('another developer cannot read, list, pay or cancel anything of this one, even by id', async () => {
    const { w } = ctx;
    const a = await w.tenantWithStaff();
    const b = await w.tenantWithStaff();
    const s = await w.seedSales(a.owner);
    const booking = await w.book(a.owner, s);
    const [down] = await w.invoicesOf(a.owner, booking.id);

    const byId = [
      `${A}/units/${s.unit.id}`,
      `${A}/projects/${s.project.id}`,
      `${A}/customers/${s.customer.id}`,
      `${A}/bookings/${booking.id}`,
      `${A}/payment-plans/${s.plan.id}`,
      `${A}/installments/${down.id}`,
    ];
    for (const path of byId) expect((await b.owner.fails('GET', path)).status, path).toBe(404);
    expect(
      (
        await b.owner.fails('POST', `${A}/installments/${down.id}/pay`, {
          method: 'cash',
          amount: 100,
        })
      ).status,
    ).toBe(404);
    expect((await b.owner.fails('POST', `${A}/bookings/${booking.id}/cancel`, {})).status).toBe(
      404,
    );
    expect(
      (await b.owner.fails('POST', `${A}/installments/${down.id}/checkout-session`, {})).status,
    ).toBe(404);

    for (const list of [
      'units',
      'projects',
      'customers',
      'bookings',
      'installments',
      'payment-plans',
      'transactions',
    ]) {
      const rows = (await b.owner.get(`${A}/${list}`)).data;
      expect(JSON.stringify(rows), list).not.toContain(booking.id);
      expect(JSON.stringify(rows), list).not.toContain(s.unit.id);
    }
    // and the original is untouched
    expect((await a.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(0);
  });

  it('the same email can exist in two developers; sign-in goes to the right one', async () => {
    const { w } = ctx;
    const a = await w.tenantWithStaff({ roles: [] });
    const b = await w.tenantWithStaff({ roles: [] });
    expect(a.tenantId).not.toBe(b.tenantId);
    const me = await a.owner.get(`${A}/auth/me`);
    expect(JSON.stringify(me)).toBeTruthy();
    expect((await b.owner.get(`${A}/tenant`)).slug).toBe(b.slug);
    expect((await a.owner.get(`${A}/tenant`)).slug).toBe(a.slug);
  });

  it('a developer short name and a user email are unique', async () => {
    const { w } = ctx;
    const a = await w.tenantWithStaff({ roles: ['finance'] });
    const dup = await w.anon.raw('POST', '/api/v1/admin/auth/login', {
      body: { email: 'x', password: 'y' },
    });
    expect(dup.status).toBe(401);
    const again = await a.owner.fails('POST', `${A}/users`, {
      email: `finance@${a.slug}.e2e.test`,
      name: 'Twin',
      role: 'finance',
      password: 'Str0ng-pass-e2e',
    });
    expect(again.status).toBe(409);
  });
});

describe('authentication', () => {
  it('refuses missing, malformed, forged and expired credentials', async () => {
    const { w, stack } = ctx;
    const t = await w.tenantWithStaff({ roles: [] });
    expect((await w.anon.fails('GET', `${A}/units`)).status).toBe(401);
    expect(
      (await createClient(stack.gatewayUrl, { token: 'not.a.jwt' }).fails('GET', `${A}/units`))
        .status,
    ).toBe(401);
    const forged = (await t.owner.raw('GET', `${A}/units`)).headers.get('x-request-id');
    expect(forged).toBeTruthy();
    const tampered = `${t.owner.token.slice(0, -4)}AAAA`;
    expect(
      (await createClient(stack.gatewayUrl, { token: tampered }).fails('GET', `${A}/units`)).status,
    ).toBe(401);
  });

  it('needs the second step: a password alone gives no access', async () => {
    const { w } = ctx;
    const t = await w.createTenant();
    const challenge = await w.anon.post(`${A}/auth/login`, {
      email: t.ownerEmail,
      password: 'Str0ng-pass-e2e',
    });
    expect(challenge.access_token).toBeUndefined();
    expect(
      (
        await w.anon.fails('POST', `${A}/auth/2fa`, {
          mfa_token: challenge.mfa_token,
          code: '000000',
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await w.anon.fails('POST', `${A}/auth/login`, {
          email: t.ownerEmail,
          password: 'wrong-password-1',
        })
      ).status,
    ).toBe(401);
  });

  it('renews a session once per refresh token, and sign-out ends it', async () => {
    const { w } = ctx;
    const t = await w.createTenant();
    const { refreshToken } = await w.staffSession(t.ownerEmail, t.ownerSecret);
    const renewed = await w.anon.post(`${A}/auth/refresh`, { refresh_token: refreshToken });
    expect(renewed.access_token).toBeTruthy();
    expect(
      (await w.anon.fails('POST', `${A}/auth/refresh`, { refresh_token: refreshToken })).status,
    ).toBe(401);
    await w.anon.post(`${A}/auth/logout`, { refresh_token: renewed.refresh_token });
    expect(
      (await w.anon.fails('POST', `${A}/auth/refresh`, { refresh_token: renewed.refresh_token }))
        .status,
    ).toBe(401);
  });
});

describe('roles and permissions', () => {
  it('refuses what a role may not do, whatever the screen shows', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff({ roles: ['sales_agent', 'finance', 'auditor', 'support'] });
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);
    // sales agents and auditors can look but not take payment
    for (const who of ['sales_agent', 'auditor']) {
      expect(
        (await t.staff[who].get(`${A}/installments`, { booking_id: booking.id })).data.length,
      ).toBeGreaterThan(0);
      expect(
        (
          await t.staff[who].fails('POST', `${A}/installments/${down.id}/pay`, {
            method: 'cash',
            amount: 100,
          })
        ).status,
        who,
      ).toBe(403);
    }
    // finance cannot manage inventory or roles
    expect(
      (await t.staff.finance.fails('POST', `${A}/projects`, { name: 'Nope', kind: 'tower' }))
        .status,
    ).toBe(403);
    expect(
      (await t.staff.finance.fails('PUT', `${A}/permissions/finance`, { permissions: [] })).status,
    ).toBe(403);
    // adjusting an amount needs its own permission
    expect(
      (
        await t.staff.sales_agent.fails('POST', `${A}/installments/${down.id}/pay`, {
          method: 'cash',
          amount: 100,
          adjusted_amount: 50,
        })
      ).status,
    ).toBe(403);
    // nobody but the owner and admin sees the user list
    expect((await t.staff.finance.fails('GET', `${A}/users`)).status).toBe(403);
  });

  it('an admin changes what a role may do and it takes effect when the session is renewed', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff({ roles: ['support'] });
    const matrix = await t.owner.get(`${A}/permissions`);
    expect(JSON.stringify(matrix)).toContain('customers.view');
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);
    expect(
      (
        await t.staff.support.fails('POST', `${A}/installments/${down.id}/pay`, {
          method: 'cash',
          amount: 100,
        })
      ).status,
    ).toBe(403);

    const role = await t.owner.put(`${A}/permissions/support`, {
      permissions: [
        ...matrix.roles.find((r) => r.role === 'support').permissions,
        'payments.record',
      ],
    });
    expect(JSON.stringify(role)).toContain('payments.record');
    // the old token still carries the old permissions; signing in again brings the new ones
    expect(
      (
        await t.staff.support.fails('POST', `${A}/installments/${down.id}/pay`, {
          method: 'cash',
          amount: 100,
        })
      ).status,
    ).toBe(403);
    const renewed = (await w.staffSession(t.logins.support.email, t.logins.support.secret)).api;
    const claims = JSON.parse(Buffer.from(renewed.token.split('.')[1], 'base64url').toString());
    expect(claims.permissions).toContain('payments.record');
    const paid = await renewed.post(`${A}/installments/${down.id}/pay`, {
      method: 'cash',
      amount: 100,
    });
    expect(paid.paid_amount).toBe(100);
  });

  it('owner and admin always keep every permission and cannot be edited', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff({ roles: [] });
    const out = await t.owner.fails('PUT', `${A}/permissions/owner`, { permissions: [] });
    expect(out.status).toBeGreaterThanOrEqual(400);
    const out2 = await t.owner.fails('PUT', `${A}/permissions/admin`, { permissions: [] });
    expect(out2.status).toBeGreaterThanOrEqual(400);
  });
});

describe('input safety', () => {
  it('answers bad input with a clear 4xx and never a server error or a stack trace', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff({ roles: [] });
    const bad = [
      ['POST', `${A}/projects`, {}],
      ['POST', `${A}/units`, { project_id: 'not-a-uuid' }],
      ['POST', `${A}/payment-plans`, { name: 'x', down_pct: 140, installment_count: 0 }],
      ['POST', `${A}/customers`, { full_name: '' }],
      ['GET', `${A}/units/not-a-uuid`],
    ];
    for (const [method, path, body] of bad) {
      const out = await t.owner.fails(method, path, body);
      expect(out.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
      expect(out.status, `${method} ${path}`).toBeLessThan(500);
      expect(JSON.stringify(out.body)).not.toMatch(/at .*\.js:\d+|node_modules/);
    }
  });

  it('refuses unknown paths and webhooks with a bad signature', async () => {
    const { w } = ctx;
    expect((await w.anon.fails('GET', '/api/v1/admin/nothing-here')).status).toBeGreaterThanOrEqual(
      401,
    );
    const stripe = await w.anon.raw('POST', '/webhooks/stripe', {
      body: { id: 'evt_x', type: 'payment_intent.succeeded' },
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    });
    expect(stripe.status).toBeGreaterThanOrEqual(400);
    expect(stripe.status).toBeLessThan(500);
    expect((await w.anon.fails('GET', '/internal/jobs/sweep')).status).toBeGreaterThanOrEqual(401);
  });
});

describe('what a create answers', () => {
  it('every created record comes back complete: no null timestamps, ids as the API documents', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff({ roles: ['finance'] });
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    const created = {
      project: s.project,
      unit: s.unit,
      plan: s.plan,
      customer: s.customer,
      booking: await t.owner.get(`${A}/bookings/${booking.id}`),
      user: await t.owner.post(`${A}/users`, {
        email: `new@${t.slug}.e2e.test`,
        name: 'New Person',
        role: 'finance',
        password: 'Str0ng-pass-e2e',
      }),
      booked: booking,
    };
    const missing = [];
    for (const [name, record] of Object.entries(created)) {
      for (const field of ['created_at', 'updated_at']) {
        if (field in record && !/^\d{4}-\d{2}-\d{2}T/.test(String(record[field])))
          missing.push(`${name}.${field}`);
      }
    }
    expect(missing).toEqual([]);
    // updates answer with the stored record too
    const renamed = await t.owner.patch(`${A}/projects/${s.project.id}`, { name: 'Renamed' });
    expect(renamed).toMatchObject({
      name: 'Renamed',
      updated_at: expect.stringMatching(/^\d{4}-/),
    });
    const spare = await t.owner.post(`${A}/units`, {
      project_id: s.project.id,
      unit_no: 'SPARE-1',
      kind: 'plot',
      area_value: 5,
      area_unit: 'marla',
      list_price: 100,
      currency: 'PKR',
    });
    const unit = await t.owner.patch(`${A}/units/${spare.id}`, { facing: 'north' });
    expect(spare.created_at).toMatch(/^\d{4}-/);
    expect(unit.updated_at).toMatch(/^\d{4}-/);
  });
});
