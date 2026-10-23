import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { CreateTenant } from '../src/tenants/application/CreateTenant.js';
import { buildIdentityTest, TENANT_INPUT } from './fakes.js';

const PORTAL = '/api/v1/portal';
const ADMIN = '/api/v1/admin';
const CUSTOMER = '00000000-0000-4000-8000-000000000301';
const PASSWORD = 'Sunshine42!';

describe('customer portal accounts', () => {
  let t;
  let tenant;
  let owner;
  let staff;
  const customerEvent = (over = {}, at = '2026-10-21T09:00:00.000Z') =>
    buildEvent({
      type: EVENT.CUSTOMER_UPSERTED,
      tenantId: tenant.id,
      producer: 'customer',
      now: new Date(at),
      data: {
        customer_id: CUSTOMER,
        full_name: 'Ali Raza',
        phone: null,
        email: 'Ali@Example.test',
        ...over,
      },
    });
  const deliver = (e) => t.app.handlers[EVENT.CUSTOMER_UPSERTED](e);
  const account = () => [...t.stores.accounts.values()][0];
  const linkOf = (mail = t.mailer.sent.at(-1)) =>
    new URL(/https:\/\/portal\.test\/[^\s"]+/.exec(mail.text)[0]);
  const post = (path, body, ip = '7.7.7.7') =>
    request(t.app).post(`${PORTAL}${path}`).set('x-forwarded-for', ip).send(body);
  const login = (over = {}) =>
    post('/auth/login', { tenant: 'pk', email: 'ali@example.test', password: PASSWORD, ...over });
  const activate = async () => {
    await deliver(customerEvent());
    const token = linkOf().searchParams.get('token');
    await post('/auth/set-password', { token, password: PASSWORD });
  };

  beforeEach(async () => {
    t = await buildIdentityTest({ withCache: true });
    ({ tenant, owner } = await new CreateTenant(t.deps).execute(TENANT_INPUT));
    staff = await t.auth.bearer({ role: 'owner', tenantId: tenant.id, userId: owner.id });
  });

  describe('opening the account', () => {
    it('creates an invited account and emails the customer a one-time link to choose a password', async () => {
      await deliver(customerEvent());
      expect(account()).toMatchObject({
        email: 'ali@example.test',
        fullName: 'Ali Raza',
        status: 'invited',
        passwordHash: null,
      });
      expect(t.mailer.sent).toHaveLength(1);
      expect(t.mailer.sent[0]).toMatchObject({ to: 'ali@example.test' });
      expect(t.mailer.sent[0].subject).toBe('Your Zameen Developers customer portal account');
      const link = linkOf();
      expect(link.pathname).toBe('/set-password');
      expect(link.searchParams.get('tenant')).toBe('pk');
      expect(link.searchParams.get('token').length).toBeGreaterThan(30);
      expect(JSON.stringify([...t.stores.links.values()])).not.toContain(
        link.searchParams.get('token'),
      ); // only a hash is kept
      expect(t.auditEntries.at(-1).action).toBe('portal.account_create');
    });

    it('does nothing twice for a repeated event, nothing for a customer without email, and keeps names in step', async () => {
      const e = customerEvent();
      await deliver(e);
      expect((await deliver(e)).duplicate).toBe(true);
      await deliver(customerEvent({ full_name: 'Ali R. Khan' }, '2026-10-21T10:00:00.000Z'));
      expect(account().fullName).toBe('Ali R. Khan');
      await deliver(customerEvent({ full_name: 'Old Name' }, '2026-10-20T10:00:00.000Z')); // a late, older event
      expect(account().fullName).toBe('Ali R. Khan');
      await deliver(customerEvent({ email: null }, '2026-10-21T11:00:00.000Z'));
      expect(account().email).toBe('ali@example.test');
      expect(t.mailer.sent).toHaveLength(1);
      await deliver(
        customerEvent({ customer_id: '00000000-0000-4000-8000-000000000302', email: null }),
      );
      expect(t.stores.accounts.size).toBe(1);
    });

    it('will not give two customers the same portal email, and says so in the audit log', async () => {
      await deliver(customerEvent());
      await deliver(
        customerEvent({
          customer_id: '00000000-0000-4000-8000-000000000302',
          full_name: 'Someone Else',
        }),
      );
      expect(t.stores.accounts.size).toBe(1);
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'portal.email_conflict' });
      await deliver(
        customerEvent({
          customer_id: '00000000-0000-4000-8000-000000000303',
          email: 'other@example.test',
        }),
      );
      await deliver(
        customerEvent(
          { customer_id: '00000000-0000-4000-8000-000000000303', email: 'ali@example.test' },
          '2026-10-21T12:00:00.000Z',
        ),
      );
      expect(t.auditEntries.filter((a) => a.action === 'portal.email_conflict')).toHaveLength(2);
    });

    it('follows a changed email: an invited customer gets the invitation again at the new address', async () => {
      await deliver(customerEvent());
      await deliver(customerEvent({ email: 'ali.new@example.test' }, '2026-10-21T10:00:00.000Z'));
      expect(account().email).toBe('ali.new@example.test');
      expect(t.mailer.sent.at(-1).to).toBe('ali.new@example.test');
      expect(t.auditEntries.map((a) => a.action)).toContain('portal.email_change');
    });
  });

  describe('choosing a password and signing in', () => {
    it('sets the password from the link once, activates the account, and tells the customer', async () => {
      await deliver(customerEvent());
      const token = linkOf().searchParams.get('token');
      expect((await login()).status).toBe(401); // no password yet
      const set = await post('/auth/set-password', { token, password: PASSWORD });
      expect(set.body).toEqual({ ok: true, tenant: 'pk', email: 'ali@example.test' });
      expect(account()).toMatchObject({
        status: 'active',
        passwordHash: expect.stringMatching(/^scrypt\$/),
      });
      expect(t.mailer.sent.at(-1).subject).toMatch(/password was changed/);
      const again = await post('/auth/set-password', { token, password: 'Another123!' });
      expect(again.status).toBe(422);
      expect(again.body.details[0].message).toMatch(/expired or was already used/);
    });

    it('refuses a weak password, an unknown link and an expired one', async () => {
      await deliver(customerEvent());
      const token = linkOf().searchParams.get('token');
      expect((await post('/auth/set-password', { token, password: 'short' })).status).toBe(422);
      expect((await post('/auth/set-password', { token, password: 'allletters' })).status).toBe(
        422,
      );
      expect((await post('/auth/set-password', { token: 'nope', password: PASSWORD })).status).toBe(
        422,
      );
      t.clock.advance(8 * 24 * 60 * 60_000);
      expect((await post('/auth/set-password', { token, password: PASSWORD })).status).toBe(422);
    });

    it('signs in with a customer token that only the portal accepts, and shows the developer’s formats', async () => {
      await activate();
      const res = await login();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        customer: {
          id: CUSTOMER,
          name: 'Ali Raza',
          email: 'ali@example.test',
          tenant: { slug: 'pk', currency: 'PKR', time_zone: 'Asia/Karachi' },
        },
      });
      const claims = await t.deps.verifier.verify(res.body.access_token);
      expect(claims).toMatchObject({
        kind: 'customer',
        customerId: CUSTOMER,
        tenantId: tenant.id,
        permissions: [],
      });
      const me = await request(t.app)
        .get(`${PORTAL}/auth/me`)
        .set('authorization', `Bearer ${res.body.access_token}`);
      expect(me.body).toMatchObject({ id: CUSTOMER, name: 'Ali Raza' });
      // the two kinds of token never cross over
      expect(
        (
          await request(t.app)
            .get(`${ADMIN}/auth/me`)
            .set('authorization', `Bearer ${res.body.access_token}`)
        ).status,
      ).toBe(401);
      expect((await request(t.app).get(`${PORTAL}/auth/me`).set(staff)).status).toBe(401);
      expect(account().lastLoginAt).toBeTruthy();
    });

    it('answers every wrong login the same way, and is case-insensitive about the email', async () => {
      await activate();
      const wrongPassword = await login({ password: 'WrongPass123' });
      const unknownEmail = await login({ email: 'nobody@example.test' });
      const unknownTenant = await login({ tenant: 'zz' });
      for (const r of [wrongPassword, unknownEmail, unknownTenant]) {
        expect(r.status).toBe(401);
        expect(r.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        });
      }
      expect((await login({ email: ' ALI@example.TEST ' })).status).toBe(200);
      expect((await post('/auth/login', { tenant: 'pk' })).status).toBe(422);
    });

    it('slows down guessing per address and per account, but not for others', async () => {
      await activate();
      const statuses = [];
      for (let i = 0; i < 12; i += 1)
        statuses.push((await login({ password: 'WrongPass123' }, '9.9.9.9')).status);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      expect((await login({ email: 'someone@else.test' })).status).toBe(401);
      expect((await login({}, '8.8.8.8')).status).toBe(429); // the account itself is locked for a while
    });

    it('refuses a disabled customer, and signs them out', async () => {
      await activate();
      const session = (await login()).body;
      const off = await request(t.app)
        .post(`${ADMIN}/customers/${CUSTOMER}/portal-access/disable`)
        .set(staff);
      expect(off.body).toMatchObject({ status: 'disabled' });
      expect((await login()).status).toBe(401);
      expect((await post('/auth/refresh', { refresh_token: session.refresh_token })).status).toBe(
        401,
      );
      const on = await request(t.app)
        .post(`${ADMIN}/customers/${CUSTOMER}/portal-access/enable`)
        .set(staff);
      expect(on.body).toMatchObject({ status: 'active' });
      expect((await login()).status).toBe(200);
    });
  });

  describe('sessions', () => {
    it('renews with a single-use refresh token, and ends every session if one is reused', async () => {
      await activate();
      const first = (await login()).body;
      const second = (await post('/auth/refresh', { refresh_token: first.refresh_token })).body;
      expect(second.access_token).toBeTruthy();
      expect(second.refresh_token).not.toBe(first.refresh_token);
      expect((await post('/auth/refresh', { refresh_token: first.refresh_token })).status).toBe(
        401,
      ); // reuse
      expect((await post('/auth/refresh', { refresh_token: second.refresh_token })).status).toBe(
        401,
      ); // all ended
    });

    it('logs out by ending the refresh token, repeatedly and without one', async () => {
      await activate();
      const s = (await login()).body;
      expect((await post('/auth/logout', { refresh_token: s.refresh_token })).body).toEqual({
        ok: true,
      });
      expect((await post('/auth/refresh', { refresh_token: s.refresh_token })).status).toBe(401);
      expect((await post('/auth/logout', { refresh_token: s.refresh_token })).status).toBe(200);
      expect((await post('/auth/logout', {})).status).toBe(200);
    });

    it('changes the password, ends other sessions, tells the customer, and checks the current password', async () => {
      await activate();
      const s = (await login()).body;
      const bearer = { authorization: `Bearer ${s.access_token}` };
      const change = (body) =>
        request(t.app).post(`${PORTAL}/auth/change-password`).set(bearer).send(body);
      expect(
        (await change({ current_password: 'WrongPass123', new_password: 'Brand-new-77' })).status,
      ).toBe(401);
      expect((await change({ current_password: PASSWORD, new_password: 'weak' })).status).toBe(422);
      expect((await change({ current_password: PASSWORD, new_password: PASSWORD })).status).toBe(
        422,
      );
      expect(
        (await change({ current_password: PASSWORD, new_password: 'Brand-new-77' })).body,
      ).toEqual({ ok: true });
      expect((await post('/auth/refresh', { refresh_token: s.refresh_token })).status).toBe(401);
      expect((await login()).status).toBe(401);
      expect((await login({ password: 'Brand-new-77' })).status).toBe(200);
      expect(t.mailer.sent.at(-1).subject).toMatch(/password was changed/);
    });
  });

  describe('forgot password', () => {
    it('emails a reset link, gives the same answer for unknown addresses, and resets once', async () => {
      await activate();
      const before = t.mailer.sent.length;
      const unknown = await post('/auth/forgot-password', {
        tenant: 'pk',
        email: 'nobody@example.test',
      });
      const known = await post('/auth/forgot-password', {
        tenant: 'pk',
        email: 'ali@example.test',
      });
      expect([unknown.status, known.status]).toEqual([202, 202]);
      expect(unknown.body).toEqual(known.body);
      expect(t.mailer.sent).toHaveLength(before + 1);
      const mail = t.mailer.sent.at(-1);
      expect(mail.subject).toBe('Reset your Zameen Developers portal password');
      const link = linkOf(mail);
      expect(link.pathname).toBe('/reset-password');
      const session = (await login()).body;
      expect(
        (
          await post('/auth/set-password', {
            token: link.searchParams.get('token'),
            password: 'Fresh-start-9',
          })
        ).status,
      ).toBe(200);
      expect((await post('/auth/refresh', { refresh_token: session.refresh_token })).status).toBe(
        401,
      ); // old devices signed out
      expect((await login()).status).toBe(401);
      expect((await login({ password: 'Fresh-start-9' })).status).toBe(200);
    });

    it('only the newest link works, at most three an hour are sent, and a disabled account gets none', async () => {
      await activate();
      const ask = () =>
        post(
          '/auth/forgot-password',
          { tenant: 'pk', email: 'ali@example.test' },
          `5.5.5.${Math.floor(Math.random() * 200)}`,
        );
      const base = t.mailer.sent.length;
      await ask();
      const first = linkOf().searchParams.get('token');
      await ask();
      const second = linkOf().searchParams.get('token');
      expect(
        (await post('/auth/set-password', { token: first, password: 'Fresh-start-9' })).status,
      ).toBe(422);
      expect(
        (await post('/auth/set-password', { token: second, password: 'Fresh-start-9' })).status,
      ).toBe(200);
      await ask();
      await ask();
      await ask();
      const sentLinks = t.mailer.sent.slice(base).filter((m) => /Reset your/.test(m.subject));
      expect(sentLinks.length).toBeLessThanOrEqual(3);
      await request(t.app).post(`${ADMIN}/customers/${CUSTOMER}/portal-access/disable`).set(staff);
      t.clock.advance(2 * 60 * 60_000);
      const count = t.mailer.sent.length;
      await ask();
      expect(t.mailer.sent).toHaveLength(count);
    });

    it('sends an invited customer who never chose a password the invitation again', async () => {
      await deliver(customerEvent());
      await post('/auth/forgot-password', { tenant: 'pk', email: 'ali@example.test' });
      expect(linkOf().pathname).toBe('/set-password');
    });
  });

  describe('what staff can do', () => {
    it('shows the state of a customer’s portal access without any secret', async () => {
      expect(
        (await request(t.app).get(`${ADMIN}/customers/${CUSTOMER}/portal-access`).set(staff)).body,
      ).toEqual({ status: 'none', customer_id: CUSTOMER });
      await deliver(customerEvent());
      const invited = await request(t.app)
        .get(`${ADMIN}/customers/${CUSTOMER}/portal-access`)
        .set(staff);
      expect(invited.body).toEqual({
        customer_id: CUSTOMER,
        email: 'ali@example.test',
        status: 'invited',
        has_password: false,
        invited_at: '2026-10-21T09:00:00.000Z',
        last_login_at: null,
      });
      expect(JSON.stringify(invited.body)).not.toMatch(/hash|token|link/i);
    });

    it('sends the invitation again, or a reset link once the customer has a password, within the hourly limit', async () => {
      await deliver(customerEvent());
      const send = () =>
        request(t.app).post(`${ADMIN}/customers/${CUSTOMER}/portal-access/send-link`).set(staff);
      const again = await send();
      expect(again.status).toBe(202);
      expect(again.body.purpose).toBe('invite');
      expect(linkOf().pathname).toBe('/set-password');
      await send();
      expect((await send()).status).toBe(409);
      t.clock.advance(61 * 60_000);
      await post('/auth/set-password', {
        token: linkOf().searchParams.get('token'),
        password: PASSWORD,
      }).catch(() => {});
      const fresh = await send();
      expect(fresh.status).toBe(202);
    });

    it('needs the customers.manage permission, and refuses a customer with no account', async () => {
      await deliver(customerEvent());
      const agent = await t.auth.bearer({ role: 'support', tenantId: tenant.id }); // may look at customers, not manage them
      for (const path of ['send-link', 'enable', 'disable']) {
        expect(
          (
            await request(t.app)
              .post(`${ADMIN}/customers/${CUSTOMER}/portal-access/${path}`)
              .set(agent)
          ).status,
        ).toBe(403);
      }
      expect(
        (await request(t.app).get(`${ADMIN}/customers/${CUSTOMER}/portal-access`).set(agent))
          .status,
      ).toBe(200);
      const none = '00000000-0000-4000-8000-000000000999';
      expect(
        (await request(t.app).post(`${ADMIN}/customers/${none}/portal-access/send-link`).set(staff))
          .status,
      ).toBe(404);
      expect(
        (await request(t.app).post(`${ADMIN}/customers/${none}/portal-access/disable`).set(staff))
          .status,
      ).toBe(404);
    });

    it('keeps tenants apart', async () => {
      await deliver(customerEvent());
      const other = await new CreateTenant(t.deps).execute({
        ...TENANT_INPUT,
        slug: 'ae',
        owner: { ...TENANT_INPUT.owner, email: 'o@ae.test' },
      });
      const otherStaff = await t.auth.bearer({
        role: 'owner',
        tenantId: other.tenant.id,
        userId: other.owner.id,
      });
      expect(
        (await request(t.app).get(`${ADMIN}/customers/${CUSTOMER}/portal-access`).set(otherStaff))
          .body.status,
      ).toBe('none');
      expect((await login({ tenant: 'ae' })).status).toBe(401);
    });
  });
});
