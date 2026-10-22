import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@estateops/kernel';
import { TENANT_BODY, buildIdentityTest } from './fakes.js';

const BOOTSTRAP = {
  'x-internal-token': 'test-internal-token',
  'x-bootstrap-token': 'test-bootstrap-token',
};

describe('identity API', () => {
  let t;
  let owner;
  let ownerSecret;
  const post = (path, body, headers = {}) => request(t.app).post(path).set(headers).send(body);
  const as = (session) => ({ Authorization: `Bearer ${session.access_token}` });

  async function signIn(email, secret) {
    const login = await post('/api/v1/admin/auth/login', { email, password: 'Passw0rd!' });
    expect(login.status).toBe(200);
    const code = t.deps.totp.code(secret, t.clock.now());
    const res = await post('/api/v1/admin/auth/2fa', { mfa_token: login.body.mfa_token, code });
    expect(res.status).toBe(200);
    return res.body;
  }

  beforeEach(async () => {
    t = await buildIdentityTest();
    const created = await post('/internal/tenants', TENANT_BODY, BOOTSTRAP);
    expect(created.status).toBe(201);
    owner = created.body.owner;
    ownerSecret = owner.totp_secret;
  });

  describe('bootstrap', () => {
    it('creates a tenant and its owner, returning the secret once', async () => {
      expect(owner).toMatchObject({ email: 'owner@pk.test', role: 'owner' });
      expect(owner.totp_secret).toMatch(/^[A-Z2-7]{32}$/);
    });
    it('needs both the internal token and the bootstrap token', async () => {
      expect(
        (
          await post('/internal/tenants', TENANT_BODY, {
            'x-internal-token': 'test-internal-token',
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await post('/internal/tenants', TENANT_BODY, {
            'x-bootstrap-token': 'test-bootstrap-token',
          })
        ).status,
      ).toBe(401);
    });
    it('answers 409 for a taken slug and 422 for a bad body', async () => {
      const dup = await post('/internal/tenants', TENANT_BODY, BOOTSTRAP);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('SLUG_TAKEN');
      const bad = await post(
        '/internal/tenants',
        { ...TENANT_BODY, slug: 'AE', owner: { email: 'x@y.test', name: 'X', password: 'x' } },
        BOOTSTRAP,
      );
      expect(bad.status).toBe(422);
      expect(bad.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('sign-in flow (the UI contract)', () => {
    it('logs in, verifies, reads /me, refreshes and logs out', async () => {
      const login = await post('/api/v1/admin/auth/login', {
        email: 'owner@pk.test',
        password: 'Passw0rd!',
      });
      expect(login.body).toEqual({ status: 'mfa_required', mfa_token: expect.any(String) });

      const code = t.deps.totp.code(ownerSecret, t.clock.now());
      const session = (
        await post('/api/v1/admin/auth/2fa', { mfa_token: login.body.mfa_token, code })
      ).body;
      expect(Object.keys(session).sort()).toEqual(['access_token', 'refresh_token', 'user']);
      expect(session.user).toMatchObject({
        email: 'owner@pk.test',
        role: 'owner',
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        tenant: {
          slug: 'pk',
          currency: 'PKR',
          locale: 'en-PK',
          time_zone: 'Asia/Karachi',
          area_unit: 'marla',
        },
      });
      expect(JSON.stringify(session)).not.toMatch(/password|totp/i);

      const me = await request(t.app).get('/api/v1/admin/auth/me').set(as(session));
      expect(me.status).toBe(200);
      expect(me.body).toEqual(session.user);

      const refreshed = await post('/api/v1/admin/auth/refresh', {
        refresh_token: session.refresh_token,
      });
      expect(Object.keys(refreshed.body).sort()).toEqual(['access_token', 'refresh_token']);
      expect(
        (await request(t.app).get('/api/v1/admin/auth/me').set(as(refreshed.body))).status,
      ).toBe(200);

      expect(
        (await post('/api/v1/admin/auth/logout', { refresh_token: refreshed.body.refresh_token }))
          .body,
      ).toEqual({ ok: true });
      expect(
        (await post('/api/v1/admin/auth/refresh', { refresh_token: refreshed.body.refresh_token }))
          .status,
      ).toBe(401);
    });

    it('rejects bad credentials with 401, a bad code with 422, and a bad body with 422', async () => {
      const wrong = await post('/api/v1/admin/auth/login', {
        email: 'owner@pk.test',
        password: 'nope',
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      const challenge = (
        await post('/api/v1/admin/auth/login', { email: 'owner@pk.test', password: 'Passw0rd!' })
      ).body;
      const badCode = await post('/api/v1/admin/auth/2fa', {
        mfa_token: challenge.mfa_token,
        code: '000000',
      });
      expect(badCode.status).toBe(422);
      expect(badCode.body.details).toEqual([{ field: 'code', message: 'That code is not valid' }]);
      const empty = await post('/api/v1/admin/auth/login', {});
      expect(empty.status).toBe(422);
      expect(empty.body.details.map((d) => d.field).sort()).toEqual(['email', 'password']);
      expect(
        (await post('/api/v1/admin/auth/2fa', { mfa_token: 'bogus', code: '123456' })).status,
      ).toBe(401);
    });

    it('answers 429 after repeated wrong passwords', async () => {
      for (let i = 0; i < 5; i += 1)
        await post('/api/v1/admin/auth/login', { email: 'owner@pk.test', password: 'nope' });
      const locked = await post('/api/v1/admin/auth/login', {
        email: 'owner@pk.test',
        password: 'Passw0rd!',
      });
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('needs a session for /me', async () => {
      expect((await request(t.app).get('/api/v1/admin/auth/me')).status).toBe(401);
    });
  });

  describe('users', () => {
    let session;
    beforeEach(async () => {
      session = await signIn('owner@pk.test', ownerSecret);
    });

    it('creates, lists, reads, updates and deactivates a user', async () => {
      const created = await post(
        '/api/v1/admin/users',
        { email: 'fin@pk.test', name: 'Fiona', role: 'finance', password: 'Passw0rd!' },
        as(session),
      );
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ email: 'fin@pk.test', role: 'finance', active: true });
      expect(created.body.totp_secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(created.body).not.toHaveProperty('password_hash');

      const list = await request(t.app).get('/api/v1/admin/users?role=finance').set(as(session));
      expect(list.body).toEqual({
        data: [expect.objectContaining({ id: created.body.id })],
        next_cursor: null,
      });
      expect(JSON.stringify(list.body)).not.toMatch(/totp|hash/);

      const got = await request(t.app)
        .get(`/api/v1/admin/users/${created.body.id}`)
        .set(as(session));
      expect(got.body.name).toBe('Fiona');

      const patched = await request(t.app)
        .patch(`/api/v1/admin/users/${created.body.id}`)
        .set(as(session))
        .send({ role: 'auditor' });
      expect(patched.body.role).toBe('auditor');

      expect(
        (await request(t.app).delete(`/api/v1/admin/users/${created.body.id}`).set(as(session)))
          .status,
      ).toBe(204);
      expect(
        (await request(t.app).get(`/api/v1/admin/users/${created.body.id}`).set(as(session))).body
          .active,
      ).toBe(false);
    });

    it('answers 422 with field details, 409 for a taken email, and 404 for strangers', async () => {
      const bad = await post(
        '/api/v1/admin/users',
        { email: 'nope', name: 'x', role: 'wizard', password: 'Passw0rd!' },
        as(session),
      );
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d) => d.field)).toEqual(['email', 'role']);
      const unknownField = await request(t.app)
        .patch(`/api/v1/admin/users/${owner.id}`)
        .set(as(session))
        .send({ tenant_id: 'x' });
      expect(unknownField.status).toBe(422);
      await post(
        '/api/v1/admin/users',
        { email: 'a@pk.test', name: 'A', role: 'support', password: 'Passw0rd!' },
        as(session),
      );
      const dup = await post(
        '/api/v1/admin/users',
        { email: 'A@pk.test', name: 'A2', role: 'support', password: 'Passw0rd!' },
        as(session),
      );
      expect(dup.status).toBe(409);
      expect(
        (
          await request(t.app)
            .get('/api/v1/admin/users/00000000-0000-4000-8000-000000000999')
            .set(as(session))
        ).status,
      ).toBe(404);
    });

    it('replays a repeated create (same Idempotency-Key) without creating twice', async () => {
      const headers = { ...as(session), 'Idempotency-Key': 'create-1' };
      const body = { email: 'once@pk.test', name: 'Once', role: 'support', password: 'Passw0rd!' };
      // identity runs without a store in this fixture, so wire one through a fresh app below
      const { composeIdentity } = await import('../src/main/compose.js');
      const { createFakeIdempotencyStore } = await import('@estateops/platform/testing');
      const store = createFakeIdempotencyStore();
      const app = composeIdentity({ ...t.deps, idempotencyStore: store });
      const first = await request(app).post('/api/v1/admin/users').set(headers).send(body);
      await new Promise((r) => setTimeout(r, 10));
      const second = await request(app).post('/api/v1/admin/users').set(headers).send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect([...t.stores.users.values()].filter((u) => u.email === 'once@pk.test')).toHaveLength(
        1,
      );
    });

    it('refuses people without permissions.manage', async () => {
      const finance = await t.auth.bearer({ role: 'finance', tenantId: session.user.tenant.id });
      for (const [method, path] of [
        ['get', '/api/v1/admin/users'],
        ['get', '/api/v1/admin/permissions'],
        ['patch', '/api/v1/admin/tenant'],
      ]) {
        const res = await request(t.app)[method](path).set(finance).send({});
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
    });

    it('keeps tenants apart: a user of another tenant is invisible', async () => {
      const other = await post(
        '/internal/tenants',
        { ...TENANT_BODY, slug: 'ae', owner: { ...TENANT_BODY.owner, email: 'o@ae.test' } },
        BOOTSTRAP,
      );
      const res = await request(t.app)
        .get(`/api/v1/admin/users/${other.body.owner.id}`)
        .set(as(session));
      expect(res.status).toBe(404);
      const list = await request(t.app).get('/api/v1/admin/users').set(as(session));
      expect(list.body.data.map((u) => u.email)).toEqual(['owner@pk.test']);
    });
  });

  describe('permissions and tenant', () => {
    let session;
    beforeEach(async () => {
      session = await signIn('owner@pk.test', ownerSecret);
    });

    it('serves the matrix in the UI shape and saves a role', async () => {
      const matrix = await request(t.app).get('/api/v1/admin/permissions').set(as(session));
      expect(matrix.status).toBe(200);
      expect(matrix.body.catalog).toHaveLength(18);
      expect(matrix.body.roles).toHaveLength(10);
      expect(matrix.body.roles[0]).toEqual({
        role: 'owner',
        permissions: expect.any(Array),
        locked: true,
      });

      const saved = await request(t.app)
        .put('/api/v1/admin/permissions/support')
        .set(as(session))
        .send({ permissions: ['dashboard.view', 'stats.view'] });
      expect(saved.body).toEqual({
        role: 'support',
        permissions: ['dashboard.view', 'stats.view'],
        locked: false,
      });
    });

    it('refuses locked roles (409), unknown permissions (422) and unknown roles (404)', async () => {
      const put = (role, permissions) =>
        request(t.app)
          .put(`/api/v1/admin/permissions/${role}`)
          .set(as(session))
          .send({ permissions });
      expect((await put('admin', [])).status).toBe(409);
      expect((await put('admin', [])).body.code).toBe('ROLE_LOCKED');
      expect((await put('support', ['nope'])).status).toBe(422);
      expect((await put('ghost', [])).status).toBe(404);
      expect(
        (await request(t.app).put('/api/v1/admin/permissions/support').set(as(session)).send({}))
          .status,
      ).toBe(422);
    });

    it('applies a permission change to that role at its next sign-in', async () => {
      await post(
        '/api/v1/admin/users',
        { email: 'sue@pk.test', name: 'Sue', role: 'support', password: 'Passw0rd!' },
        as(session),
      ).then(async (res) => {
        t.sueSecret = res.body.totp_secret;
      });
      const before = await signIn('sue@pk.test', t.sueSecret);
      expect(before.user.permissions).not.toContain('stats.view');
      await request(t.app)
        .put('/api/v1/admin/permissions/support')
        .set(as(session))
        .send({ permissions: [...before.user.permissions, 'stats.view'] });
      const after = await signIn('sue@pk.test', t.sueSecret);
      expect(after.user.permissions).toContain('stats.view');
    });

    it('reads and updates the own tenant, never its slug or currency', async () => {
      const got = await request(t.app).get('/api/v1/admin/tenant').set(as(session));
      expect(got.body).toMatchObject({ slug: 'pk', currency: 'PKR' });
      const patched = await request(t.app)
        .patch('/api/v1/admin/tenant')
        .set(as(session))
        .send({ name: 'Zameen Group', area_unit: 'kanal' });
      expect(patched.body).toMatchObject({
        name: 'Zameen Group',
        area_unit: 'kanal',
        slug: 'pk',
        currency: 'PKR',
      });
      expect(
        (
          await request(t.app)
            .patch('/api/v1/admin/tenant')
            .set(as(session))
            .send({ currency: 'USD' })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(t.app)
            .patch('/api/v1/admin/tenant')
            .set(as(session))
            .send({ area_unit: 'acre' })
        ).status,
      ).toBe(422);
    });
  });

  it('serves health and acknowledges stray events', async () => {
    expect((await request(t.app).get('/health/live')).body.status).toBe('live');
    const stray = await request(t.app)
      .post('/internal/events')
      .set('x-internal-token', 'test-internal-token')
      .send({
        id: '00000000-0000-4000-8000-000000000001',
        type: 'future.thing',
        tenant_id: '00000000-0000-4000-8000-000000000002',
        occurred_at: '2026-10-21T09:00:00.000Z',
        producer: 'x',
        version: 1,
        data: {},
      });
    expect(stray.status).toBe(202);
  });
});
