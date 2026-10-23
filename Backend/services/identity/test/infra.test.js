import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, newId } from '@estateops/kernel';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createTypeormUow,
  silentLogger,
  createMemoryMailer,
} from '@estateops/platform';
import { createTestAuth, createTestDatabase, postgresAvailable } from '@estateops/platform/testing';
import { createTokenService } from '../src/auth/infrastructure/tokens.js';
import { createTotp } from '../src/auth/infrastructure/totp.js';
import { composeIdentity } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { createScryptHasher } from '../src/users/infrastructure/scryptHasher.js';
import { createTenant } from '../src/tenants/domain/tenant.js';
import { createUser } from '../src/users/domain/user.js';
import { TENANT_BODY, TENANT_INPUT } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[identity db tests] no PostgreSQL reachable: skipping\n');

describe.skipIf(!available)('identity on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  const run = (work) => uow.run(work);

  const tenantRow = (slug = `t${Math.random().toString(36).slice(2, 8)}`) =>
    createTenant({ ...TENANT_INPUT, slug });
  const userRow = (tenantId, over = {}) =>
    createUser({
      tenantId,
      email: `${newId()}@x.test`,
      name: 'Sam',
      role: 'support',
      passwordHash: 'h',
      totpSecret: 's',
      ...over,
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 8 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'identity', buildRepos });
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  describe('tenants and users', () => {
    it('stores and reads a tenant, and refuses a duplicate slug in any case', async () => {
      const t = tenantRow('dup');
      await run((r) => r.tenants.insert(t));
      expect(await run((r) => r.tenants.findById(t.id))).toMatchObject({
        slug: 'dup',
        currency: 'PKR',
        timeZone: 'Asia/Karachi',
        version: 1,
      });
      expect((await run((r) => r.tenants.findBySlug('DUP'))).id).toBe(t.id);
      await expect(
        run((r) => r.tenants.insert({ ...tenantRow('dup2'), slug: 'dup' })),
      ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
    });

    it('keeps an email unique across tenants, ignoring case', async () => {
      const a = tenantRow();
      const b = tenantRow();
      await run(async (r) => {
        await r.tenants.insert(a);
        await r.tenants.insert(b);
      });
      const first = userRow(a.id, { email: 'same@x.test' });
      await run((r) => r.users.insert(first));
      await expect(
        run((r) => r.users.insert(userRow(b.id, { email: 'SAME@x.test' }))),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
      expect((await run((r) => r.users.findByEmail('Same@X.test'))).id).toBe(first.id);
    });

    it('detects a concurrent edit with the version, and reports a missing row', async () => {
      const t = tenantRow();
      await run((r) => r.tenants.insert(t));
      const u = userRow(t.id);
      await run((r) => r.users.insert(u));
      const saved = await run((r) => r.users.update({ ...u, name: 'First edit' }));
      expect(saved.version).toBe(2);
      await expect(run((r) => r.users.update({ ...u, name: 'Stale edit' }))).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
      await expect(
        run((r) => r.users.update({ ...u, id: newId(), version: 1 })),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('scopes reads to the tenant and pages with a keyset cursor', async () => {
      const a = tenantRow();
      const b = tenantRow();
      await run(async (r) => {
        await r.tenants.insert(a);
        await r.tenants.insert(b);
        for (let i = 0; i < 12; i += 1)
          await r.users.insert(
            userRow(a.id, {
              name: `Person ${String(i % 4)} ${i}`,
              role: i % 3 === 0 ? 'finance' : 'support',
            }),
          );
        await r.users.insert(userRow(b.id, { name: 'Person 0 other' }));
      });
      const seen = [];
      let cursor;
      do {
        const page = await run((r) => r.users.list(a.id, { cursor, limit: 5 }));
        seen.push(...page.items.map((u) => u.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
      expect((await run((r) => r.users.list(a.id, { role: 'finance' }))).items).toHaveLength(4);
      expect(
        (await run((r) => r.users.list(a.id, { q: 'person 1' }))).items.length,
      ).toBeGreaterThan(0);
      expect((await run((r) => r.users.list(a.id, { q: '%' }))).items).toHaveLength(0);
      expect(await run((r) => r.users.findById(b.id, seen[0]))).toBeNull();
    });

    it('counts only active owners', async () => {
      const t = tenantRow();
      await run(async (r) => {
        await r.tenants.insert(t);
        await r.users.insert(userRow(t.id, { role: 'owner' }));
        await r.users.insert({ ...userRow(t.id, { role: 'owner' }), active: false });
        await r.users.insert(userRow(t.id, { role: 'admin' }));
      });
      expect(await run((r) => r.users.countActiveOwners(t.id))).toBe(1);
    });
  });

  describe('role permissions', () => {
    it('replaces a role atomically and reads them in catalogue order', async () => {
      const t = tenantRow();
      await run((r) => r.tenants.insert(t));
      await run((r) =>
        r.rolePermissions.replace(t.id, 'support', ['stats.view', 'dashboard.view']),
      );
      expect(await run((r) => r.rolePermissions.get(t.id, 'support'))).toEqual([
        'dashboard.view',
        'stats.view',
      ]);
      await run((r) => r.rolePermissions.replace(t.id, 'support', []));
      expect(await run((r) => r.rolePermissions.get(t.id, 'support'))).toEqual([]);
      await run((r) =>
        r.rolePermissions.replace(t.id, 'finance', DEFAULT_ROLE_PERMISSIONS.finance),
      );
      const all = await run((r) => r.rolePermissions.allByRole(t.id));
      expect(Object.keys(all)).toEqual(['finance']);
      await expect(
        run((r) => r.rolePermissions.replace(t.id, 'finance', ['not.a.permission'])),
      ).rejects.toThrow();
    });
  });

  describe('sign-in state', () => {
    it('lets a challenge and a refresh token be consumed exactly once, even in parallel', async () => {
      const t = tenantRow();
      const u = userRow(t.id);
      await run(async (r) => {
        await r.tenants.insert(t);
        await r.users.insert(u);
      });
      const challengeId = newId();
      const soon = new Date(Date.now() + 60_000);
      await run((r) =>
        r.mfaChallenges.insert({ id: challengeId, tenantId: t.id, userId: u.id, expiresAt: soon }),
      );
      const results = await Promise.all(
        [1, 2, 3].map(() => run((r) => r.mfaChallenges.markUsed(challengeId, new Date()))),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await run((r) => r.mfaChallenges.findById('not-a-uuid'))).toBeNull();

      const tokenId = newId();
      await run((r) =>
        r.refreshTokens.insert({
          id: tokenId,
          tenantId: t.id,
          userId: u.id,
          tokenHash: 'hash-1',
          expiresAt: soon,
        }),
      );
      const used = await Promise.all(
        [1, 2].map(() => run((r) => r.refreshTokens.markUsed(tokenId, new Date()))),
      );
      expect(used.filter(Boolean)).toHaveLength(1);
      expect((await run((r) => r.refreshTokens.findByHash('hash-1'))).usedAt).not.toBeNull();

      await run((r) =>
        r.refreshTokens.insert({
          id: newId(),
          tenantId: t.id,
          userId: u.id,
          tokenHash: 'hash-2',
          expiresAt: soon,
        }),
      );
      await run((r) => r.refreshTokens.revokeAllForUser(u.id));
      expect((await run((r) => r.refreshTokens.findByHash('hash-2'))).usedAt).not.toBeNull();
    });

    it('counts failures inside the window only', async () => {
      const t = tenantRow();
      const u = userRow(t.id);
      await run(async (r) => {
        await r.tenants.insert(t);
        await r.users.insert(u);
        await r.loginHistory.record({
          tenantId: t.id,
          userId: u.id,
          method: 'password',
          success: false,
        });
        await r.loginHistory.record({
          tenantId: t.id,
          userId: u.id,
          method: 'password',
          success: false,
        });
        await r.loginHistory.record({
          tenantId: t.id,
          userId: u.id,
          method: 'password',
          success: true,
        });
        await r.loginHistory.record({
          tenantId: t.id,
          userId: u.id,
          method: '2fa',
          success: false,
        });
      });
      const since = new Date(Date.now() - 60_000);
      expect(await run((r) => r.loginHistory.countFailures(u.id, 'password', since))).toBe(2);
      expect(await run((r) => r.loginHistory.countFailures(u.id, '2fa', since))).toBe(1);
      expect(
        await run((r) =>
          r.loginHistory.countFailures(u.id, 'password', new Date(Date.now() + 60_000)),
        ),
      ).toBe(0);
    });
  });

  describe('customer portal accounts', () => {
    const accountRow = (tenantId, over = {}) => ({
      id: newId(),
      tenantId,
      customerId: newId(),
      email: `c${newId().slice(0, 8)}@example.test`,
      fullName: 'Ali Raza',
      passwordHash: null,
      status: 'invited',
      invitedAt: new Date(),
      ...over,
    });

    it('keeps one account per customer and one email per tenant, and an active account always has a password', async () => {
      const a = tenantRow();
      const b = tenantRow();
      await run(async (r) => {
        await r.tenants.insert(a);
        await r.tenants.insert(b);
      });
      const first = accountRow(a.id);
      await run((r) => r.customerAccounts.insert(first, new Date()));
      await expect(
        run((r) => r.customerAccounts.insert(accountRow(a.id, { email: first.email }), new Date())),
      ).rejects.toMatchObject({ code: 'PORTAL_EMAIL_TAKEN' });
      // the same address is fine for another developer
      await run((r) =>
        r.customerAccounts.insert(accountRow(b.id, { email: first.email }), new Date()),
      );
      await expect(
        ds.query("UPDATE identity.customer_account SET status = 'active' WHERE id = $1", [
          first.id,
        ]),
      ).rejects.toMatchObject({ driverError: { constraint: 'customer_account_password_chk' } });
      await expect(
        ds.query(
          "UPDATE identity.customer_account SET email = 'MiXed@Example.test' WHERE id = $1",
          [first.id],
        ),
      ).rejects.toMatchObject({ driverError: { constraint: 'customer_account_email_chk' } });
      await expect(
        ds.query("UPDATE identity.customer_account SET status = 'frozen' WHERE id = $1", [
          first.id,
        ]),
      ).rejects.toMatchObject({ driverError: { constraint: 'customer_account_status_chk' } });
    });

    it('lets a one-time link be used by exactly one of several simultaneous requests', async () => {
      const t = tenantRow();
      const account = accountRow(t.id);
      await run(async (r) => {
        await r.tenants.insert(t);
        await r.customerAccounts.insert(account, new Date());
        await r.accountTokens.insert({
          id: newId(),
          tenantId: t.id,
          accountId: account.id,
          purpose: 'invite',
          tokenHash: `h-${account.id}`,
          expiresAt: new Date(Date.now() + 60_000),
        });
      });
      const link = await run((r) => r.accountTokens.findByHash(`h-${account.id}`));
      const wins = await Promise.all(
        Array.from({ length: 6 }, () => run((r) => r.accountTokens.markUsed(link.id, new Date()))),
      );
      expect(wins.filter(Boolean)).toHaveLength(1);
      await expect(
        ds.query("UPDATE identity.account_token SET purpose = 'login' WHERE id = $1", [link.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'account_token_purpose_chk' } });
    });

    it('ignores an older profile event, closes open links, counts recent ones and ends sessions', async () => {
      const t = tenantRow();
      const account = accountRow(t.id);
      await run(async (r) => {
        await r.tenants.insert(t);
        await r.customerAccounts.insert(account, '2026-10-21T10:00:00Z');
      });
      expect(
        await run((r) =>
          r.customerAccounts.applyProfile(
            account.id,
            { email: account.email, fullName: 'Old' },
            '2026-10-20T10:00:00Z',
          ),
        ),
      ).toBe(false);
      expect(
        await run((r) =>
          r.customerAccounts.applyProfile(
            account.id,
            { email: account.email, fullName: 'New' },
            '2026-10-22T10:00:00Z',
          ),
        ),
      ).toBe(true);
      expect((await run((r) => r.customerAccounts.findById(t.id, account.id))).fullName).toBe(
        'New',
      );

      for (const n of [1, 2]) {
        await run((r) =>
          r.accountTokens.insert({
            id: newId(),
            tenantId: t.id,
            accountId: account.id,
            purpose: 'reset',
            tokenHash: `x${n}-${account.id}`,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        );
      }
      expect(
        await run((r) => r.accountTokens.countSince(account.id, new Date(Date.now() - 60_000))),
      ).toBe(2);
      await run((r) => r.accountTokens.closeOpen(account.id, new Date()));
      expect(
        (await run((r) => r.accountTokens.findByHash(`x1-${account.id}`))).usedAt,
      ).toBeTruthy();

      await run((r) =>
        r.customerRefreshTokens.insert({
          id: newId(),
          tenantId: t.id,
          accountId: account.id,
          tokenHash: `rt-${account.id}`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
      await run((r) => r.customerRefreshTokens.revokeAllForAccount(account.id));
      expect(
        await run((r) => r.customerRefreshTokens.findByHash(`rt-${account.id}`)),
      ).toBeUndefined();
    });
  });

  describe('the whole service on the real stack', () => {
    it('bootstraps a tenant, signs in, changes a role and sees it at the next sign-in', async () => {
      const auth = await createTestAuth();
      const totp = createTotp();
      const app = composeIdentity({
        uow,
        clock: { now: () => new Date() },
        hasher: createScryptHasher({ N: 2 ** 8 }),
        totp,
        tokens: createTokenService(),
        signer: auth.signer,
        verifier: auth.verifier,
        logger: silentLogger,
        internalToken: 'internal-token-1',
        bootstrapToken: 'bootstrap-token-1',
        idempotencyStore: createIdempotencyStore(ds, { schema: 'identity' }),
        readyCheck: () => ds.query('SELECT 1'),
        mailer: createMemoryMailer(),
      });
      const headers = {
        'x-internal-token': 'internal-token-1',
        'x-bootstrap-token': 'bootstrap-token-1',
      };
      const body = {
        ...TENANT_BODY,
        slug: 'e2e',
        owner: { ...TENANT_BODY.owner, email: 'owner@e2e.test' },
      };
      const created = await request(app).post('/internal/tenants').set(headers).send(body);
      expect(created.status).toBe(201);
      expect((await request(app).post('/internal/tenants').set(headers).send(body)).status).toBe(
        409,
      );

      const signIn = async (email, secret) => {
        const login = await request(app)
          .post('/api/v1/admin/auth/login')
          .send({ email, password: 'Passw0rd!' });
        const res = await request(app)
          .post('/api/v1/admin/auth/2fa')
          .send({ mfa_token: login.body.mfa_token, code: totp.code(secret) });
        expect(res.status).toBe(200);
        return res.body;
      };
      const session = await signIn('owner@e2e.test', created.body.owner.totp_secret);
      const bearer = { Authorization: `Bearer ${session.access_token}` };
      expect((await request(app).get('/api/v1/admin/auth/me').set(bearer)).body.tenant.slug).toBe(
        'e2e',
      );

      const sue = await request(app)
        .post('/api/v1/admin/users')
        .set(bearer)
        .send({ email: 'sue@e2e.test', name: 'Sue', role: 'support', password: 'Passw0rd!' });
      expect(sue.status).toBe(201);
      expect((await signIn('sue@e2e.test', sue.body.totp_secret)).user.permissions).not.toContain(
        'stats.view',
      );
      await request(app)
        .put('/api/v1/admin/permissions/support')
        .set(bearer)
        .send({ permissions: [...DEFAULT_ROLE_PERMISSIONS.support, 'stats.view'] });
      expect((await signIn('sue@e2e.test', sue.body.totp_secret)).user.permissions).toContain(
        'stats.view',
      );

      // refresh rotation and theft detection on the real tables
      const first = await request(app)
        .post('/api/v1/admin/auth/refresh')
        .send({ refresh_token: session.refresh_token });
      expect(first.status).toBe(200);
      expect(
        (
          await request(app)
            .post('/api/v1/admin/auth/refresh')
            .send({ refresh_token: session.refresh_token })
        ).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post('/api/v1/admin/auth/refresh')
            .send({ refresh_token: first.body.refresh_token })
        ).status,
      ).toBe(401);

      // the tenant event, the audit trail and the outbox all committed with the data
      const outbox = await ds.query(
        `SELECT type FROM identity.outbox WHERE type = 'tenant.upserted'`,
      );
      expect(outbox.length).toBeGreaterThanOrEqual(1);
      const audit = await ds.query(
        `SELECT action FROM identity.audit_log WHERE action IN ('tenant.create','user.create','role.update_permissions')`,
      );
      expect(audit.map((a) => a.action).sort()).toEqual([
        'role.update_permissions',
        'tenant.create',
        'user.create',
      ]);
      expect((await request(app).get('/health/ready')).status).toBe(200);
    });
  });
});
