import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  ConflictError,
  NotFoundError,
} from '@estateops/kernel';
import { createTestAuth, createFakeUow } from '@estateops/platform/testing';
import { createTotp } from '../src/auth/infrastructure/totp.js';
import { createTokenService } from '../src/auth/infrastructure/tokens.js';
import { createScryptHasher } from '../src/users/infrastructure/scryptHasher.js';
import { composeIdentity } from '../src/main/compose.js';
import {
  createCache,
  createMemoryClient,
  createMemoryMailer,
  silentLogger,
} from '@estateops/platform';

/** In-memory identity repositories with the same rules as the SQL ones (unique email, versions). */
export function makeIdentityRepos(clock = { now: () => new Date() }) {
  const tenants = new Map();
  const users = new Map();
  const grants = new Map(); // `${tenantId}|${role}` -> keys
  const challenges = new Map();
  const refresh = new Map();
  const history = [];
  const accounts = new Map();
  const links = new Map();
  const portalRefresh = new Map();
  const portalHistory = [];

  const touch = (row) => ({ ...row, version: row.version + 1 });
  return {
    stores: {
      tenants,
      users,
      grants,
      challenges,
      refresh,
      history,
      accounts,
      links,
      portalRefresh,
      portalHistory,
    },
    repos: {
      tenants: {
        insert: async (t) => {
          if ([...tenants.values()].some((x) => x.slug.toLowerCase() === t.slug.toLowerCase())) {
            throw new ConflictError('SLUG_TAKEN', 'That tenant short name is already used');
          }
          tenants.set(t.id, { ...t });
          return t;
        },
        findById: async (id) => tenants.get(id) ?? null,
        findBySlug: async (slug) =>
          [...tenants.values()].find((t) => t.slug.toLowerCase() === slug.toLowerCase()) ?? null,
        update: async (t) => {
          const cur = tenants.get(t.id);
          if (!cur) throw new NotFoundError();
          if (cur.version !== t.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
          const saved = touch(t);
          tenants.set(t.id, saved);
          return saved;
        },
      },
      users: {
        insert: async (u) => {
          if ([...users.values()].some((x) => x.email === u.email))
            throw new ConflictError('EMAIL_TAKEN', 'taken');
          users.set(u.id, { ...u });
          return u;
        },
        findByEmail: async (email) =>
          [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
        findById: async (tenantId, id) => {
          const u = users.get(id);
          return u && u.tenantId === tenantId ? u : null;
        },
        list: async (tenantId, { q, role, cursor, limit }) => {
          const size = clampLimit(limit);
          const after = decodeCursor(cursor);
          let rows = [...users.values()].filter((u) => u.tenantId === tenantId);
          if (role) rows = rows.filter((u) => u.role === role);
          if (q)
            rows = rows.filter((u) =>
              `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()),
            );
          rows.sort(
            (a, b) =>
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id),
          );
          if (after) rows = rows.filter((u) => [u.name.toLowerCase(), u.id] > [after.v, after.id]);
          const page = rows.slice(0, size);
          const last = page.at(-1);
          return {
            items: page,
            nextCursor:
              rows.length > size ? encodeCursor({ v: last.name.toLowerCase(), id: last.id }) : null,
          };
        },
        countActiveOwners: async (tenantId) =>
          [...users.values()].filter(
            (u) => u.tenantId === tenantId && u.role === 'owner' && u.active,
          ).length,
        update: async (u) => {
          const cur = users.get(u.id);
          if (!cur) throw new NotFoundError();
          if (cur.version !== u.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
          const saved = touch(u);
          users.set(u.id, saved);
          return saved;
        },
      },
      rolePermissions: {
        get: async (tenantId, role) => [...(grants.get(`${tenantId}|${role}`) ?? [])],
        allByRole: async (tenantId) =>
          Object.fromEntries(
            [...grants]
              .filter(([k]) => k.startsWith(`${tenantId}|`))
              .map(([k, v]) => [k.split('|')[1], [...v]]),
          ),
        replace: async (tenantId, role, keys) => void grants.set(`${tenantId}|${role}`, [...keys]),
      },
      mfaChallenges: {
        insert: async (c) => void challenges.set(c.id, { ...c, usedAt: null }),
        findById: async (id) => challenges.get(id) ?? null,
        markUsed: async (id, now) => {
          const c = challenges.get(id);
          if (!c || c.usedAt) return false;
          c.usedAt = now;
          return true;
        },
      },
      refreshTokens: {
        insert: async (t) => void refresh.set(t.tokenHash, { ...t, usedAt: null }),
        findByHash: async (hash) => refresh.get(hash) ?? null,
        markUsed: async (id, now) => {
          const t = [...refresh.values()].find((x) => x.id === id);
          if (!t || t.usedAt) return false;
          t.usedAt = now;
          return true;
        },
        revokeByHash: async (hash) => {
          const t = refresh.get(hash);
          if (t && !t.usedAt) t.usedAt = new Date();
        },
        revokeAllForUser: async (userId) => {
          for (const t of refresh.values())
            if (t.userId === userId && !t.usedAt) t.usedAt = new Date();
        },
      },
      customerAccounts: {
        insert: async (a, sourceAt) => {
          if ([...accounts.values()].some((x) => x.tenantId === a.tenantId && x.email === a.email))
            throw new ConflictError('PORTAL_EMAIL_TAKEN', 'taken');
          accounts.set(a.id, { ...a, sourceAt });
          return a;
        },
        findById: async (t, id) =>
          accounts.get(id)?.tenantId === t ? { ...accounts.get(id) } : null,
        findByCustomer: async (t, c) => {
          const a = [...accounts.values()].find((x) => x.tenantId === t && x.customerId === c);
          return a ? { ...a } : null;
        },
        findByEmail: async (t, email) => {
          const a = [...accounts.values()].find((x) => x.tenantId === t && x.email === email);
          return a ? { ...a } : null;
        },
        applyProfile: async (id, { email, fullName }, sourceAt) => {
          const a = accounts.get(id);
          if (new Date(a.sourceAt) > new Date(sourceAt)) return false;
          if (
            [...accounts.values()].some(
              (x) => x.id !== id && x.tenantId === a.tenantId && x.email === email,
            )
          )
            throw new ConflictError('PORTAL_EMAIL_TAKEN', 'taken');
          Object.assign(a, { email, fullName, sourceAt });
          return true;
        },
        setPassword: async (id, hash, now) => {
          const a = accounts.get(id);
          Object.assign(a, {
            passwordHash: hash,
            passwordChangedAt: now,
            status: a.status === 'disabled' ? 'disabled' : 'active',
          });
        },
        setStatus: async (id, status) => void (accounts.get(id).status = status),
        touchLogin: async (id, now) => void (accounts.get(id).lastLoginAt = now),
        markInvited: async (id, now) => void (accounts.get(id).invitedAt = now),
      },
      accountTokens: {
        insert: async (l) =>
          void links.set(l.tokenHash, { ...l, usedAt: null, createdAt: clock.now() }),
        findByHash: async (h) => (links.get(h) ? { ...links.get(h) } : null),
        markUsed: async (id, now) => {
          const l = [...links.values()].find((x) => x.id === id);
          if (!l || l.usedAt) return false;
          l.usedAt = now;
          return true;
        },
        closeOpen: async (accountId, now) => {
          for (const l of links.values())
            if (l.accountId === accountId && !l.usedAt) l.usedAt = now;
        },
        countSince: async (accountId, since) =>
          [...links.values()].filter((l) => l.accountId === accountId && l.createdAt >= since)
            .length,
      },
      customerRefreshTokens: {
        insert: async (t) => void portalRefresh.set(t.tokenHash, { ...t, usedAt: null }),
        findByHash: async (h) => (portalRefresh.get(h) ? { ...portalRefresh.get(h) } : null),
        markUsed: async (id, now) => {
          const t = [...portalRefresh.values()].find((x) => x.id === id);
          if (!t || t.usedAt) return false;
          t.usedAt = now;
          return true;
        },
        revokeByHash: async (h) => void portalRefresh.delete(h),
        revokeAllForAccount: async (accountId) => {
          for (const [k, t] of portalRefresh)
            if (t.accountId === accountId) portalRefresh.delete(k);
        },
      },
      customerLogins: { record: async (e) => void portalHistory.push({ ...e, at: clock.now() }) },
      loginHistory: {
        record: async (e) => void history.push({ ...e, at: clock.now() }),
        countFailures: async (userId, method, since) =>
          history.filter(
            (h) => h.userId === userId && h.method === method && !h.success && h.at >= since,
          ).length,
      },
    },
  };
}

/** A clock tests can move. */
export function movableClock(startIso = '2026-10-21T09:00:00.000Z') {
  let ms = Date.parse(startIso);
  return { now: () => new Date(ms), advance: (delta) => void (ms += delta) };
}

export const TENANT_INPUT = {
  slug: 'pk',
  name: 'Zameen Developers',
  currency: 'PKR',
  locale: 'en-PK',
  timeZone: 'Asia/Karachi',
  areaUnit: 'marla',
  owner: { email: 'owner@pk.test', name: 'Olivia Owner', password: 'Passw0rd!' },
};

export const TENANT_BODY = {
  slug: 'pk',
  name: 'Zameen Developers',
  currency: 'PKR',
  locale: 'en-PK',
  time_zone: 'Asia/Karachi',
  area_unit: 'marla',
  owner: { email: 'owner@pk.test', name: 'Olivia Owner', password: 'Passw0rd!' },
};

/** Everything the use cases and the HTTP app need, wired with fakes and real crypto. */
export async function buildIdentityTest({ withCache = false } = {}) {
  const clock = movableClock();
  const memory = makeIdentityRepos(clock);
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  const cacheClient = withCache ? createMemoryClient({ now: () => clock.now().getTime() }) : null;
  const cache = cacheClient
    ? createCache({ client: cacheClient, logger: silentLogger, now: () => clock.now().getTime() })
    : null;
  const mailer = createMemoryMailer();
  const deps = {
    uow: fake.uow,
    clock,
    hasher: createScryptHasher({ N: 2 ** 8 }),
    totp: createTotp(),
    tokens: createTokenService(),
    signer: auth.signer,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
    bootstrapToken: 'test-bootstrap-token',
    cache,
    mailer,
    portalUrl: 'https://portal.test',
  };
  return {
    ...memory,
    ...fake,
    auth,
    clock,
    cache,
    cacheClient,
    mailer,
    deps,
    app: composeIdentity(deps),
  };
}
