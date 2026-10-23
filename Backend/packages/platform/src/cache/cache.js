/**
 * Application cache over Redis, built to be optional: if Redis is slow, down or not configured the
 * app still answers, just from the database. Every command is guarded, a failure opens a short
 * circuit (calls skip Redis for `breakerMs`) so a dead Redis costs nothing, and results are never
 * trusted to be there.
 *
 *  - remember(): cache-aside with a per-tenant version in the key. Bumping the version (one INCR)
 *    invalidates every cached value of that namespace for the tenant, with no key scanning, on
 *    every replica at once. Concurrent misses in one process share a single load (no stampede).
 *  - hit(): a windowed counter for rate limits and login throttling; fails open (allows).
 */
export function createCache({
  client,
  logger,
  prefix = 'eo',
  defaultTtlMs = 30_000,
  breakerMs = 5_000,
  now = () => Date.now(),
}) {
  let openUntil = 0;
  const inflight = new Map();
  const stats = { hits: 0, misses: 0, errors: 0, bypassed: 0 };

  async function guarded(fn, fallback) {
    if (!client) return fallback;
    if (now() < openUntil) {
      stats.bypassed += 1;
      return fallback;
    }
    try {
      return await fn();
    } catch (error) {
      stats.errors += 1;
      openUntil = now() + breakerMs;
      logger?.warn({ err: error }, 'cache unavailable, serving without it');
      return fallback;
    }
  }

  const versionKey = (ns, tenantId) => `${prefix}:v:${ns}:${tenantId}`;
  const valueKey = (ns, tenantId, version, key) =>
    `${prefix}:c:${ns}:${tenantId}:${version}:${key}`;

  const api = {
    stats,
    /** Is Redis answering right now? (for readiness reports; never blocks serving) */
    available: () => guarded(async () => (await client.ping()) === 'PONG', false),

    async version(ns, tenantId) {
      return guarded(async () => Number(await client.get(versionKey(ns, tenantId))) || 0, 0);
    },

    /** Invalidates everything cached under this namespace for the tenant. */
    async bump(ns, tenantId) {
      return guarded(() => client.incr(versionKey(ns, tenantId)), null);
    },

    /**
     * Cached value for (ns, tenant, key) or the loader's result. `ttlMs` bounds staleness even if
     * nobody bumps. The loader's errors always propagate; cache errors never do.
     */
    async remember({ ns, tenantId, key, ttlMs = defaultTtlMs }, loader) {
      const version = await api.version(ns, tenantId);
      const full = valueKey(ns, tenantId, version, key);
      const cached = await guarded(() => client.get(full), null);
      if (cached !== null) {
        stats.hits += 1;
        return JSON.parse(cached);
      }
      stats.misses += 1;
      if (inflight.has(full)) return inflight.get(full);
      const load = (async () => {
        try {
          const value = await loader();
          if (value !== undefined)
            await guarded(() => client.set(full, JSON.stringify(value), ttlMs), null);
          return value;
        } finally {
          inflight.delete(full);
        }
      })();
      inflight.set(full, load);
      return load;
    },

    /** Counts one hit in a window. Returns { count, ttlMs }; if Redis is out, { count: 0 } so nothing is blocked. */
    async hit(key, windowMs) {
      return guarded(() => client.incrWindow(`${prefix}:h:${key}`, windowMs), {
        count: 0,
        ttlMs: windowMs,
        skipped: true,
      });
    },

    /** How many hits a key has in its window, without adding one. */
    async count(key) {
      return guarded(async () => Number(await client.get(`${prefix}:h:${key}`)) || 0, 0);
    },

    async clear(key) {
      return guarded(() => client.del(`${prefix}:h:${key}`), 0);
    },

    async close() {
      await client?.quit();
    },
  };
  return api;
}

/** A cache that stores nothing: what a service uses when no Redis is configured. */
export const createNullCache = () => createCache({ client: null });
