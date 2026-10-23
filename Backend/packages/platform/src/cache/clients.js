import Redis from 'ioredis';

/**
 * The small command set the cache needs, over Redis (ioredis) or in memory. Both answer the same
 * way, so the cache logic is tested on the in-memory one and run on Redis.
 *
 *   get(key) -> string|null          set(key, value, ttlMs)          del(...keys) -> number
 *   incr(key) -> number              incrWindow(key, windowMs) -> { count, ttlMs }
 *   ping()                           quit()
 */

// INCR and set the expiry on the first hit in one step, so a crash can never leave a counter
// without an expiry (which would block someone for ever).
const WINDOW_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { n, redis.call('PTTL', KEYS[1]) }
`;

export function createRedisClient(url, options = {}) {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: true, // commands wait for the connection, but never longer than commandTimeout
    connectTimeout: 2_000,
    commandTimeout: 500,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 2_000),
    ...options,
  });
  redis.on('error', () => {}); // surfaced through failed commands, which the cache handles
  redis.defineCommand('incrWindow', { numberOfKeys: 1, lua: WINDOW_SCRIPT });
  return {
    get: (key) => redis.get(key),
    set: (key, value, ttlMs) => redis.set(key, value, 'PX', ttlMs),
    del: (...keys) => (keys.length ? redis.del(...keys) : 0),
    incr: (key) => redis.incr(key),
    incrWindow: async (key, windowMs) => {
      const [count, ttlMs] = await redis.incrWindow(key, windowMs);
      return { count, ttlMs };
    },
    ping: () => redis.ping(),
    quit: () => redis.quit().catch(() => redis.disconnect()),
  };
}

/** A process-local stand-in with the same behaviour, including expiry. */
export function createMemoryClient({ now = () => Date.now() } = {}) {
  const data = new Map();
  const live = (key) => {
    const entry = data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
      data.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    data,
    failing: false,
    guard() {
      if (this.failing) throw new Error('memory client set to fail');
    },
    async get(key) {
      this.guard();
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlMs) {
      this.guard();
      data.set(key, { value: String(value), expiresAt: ttlMs ? now() + ttlMs : null });
      return 'OK';
    },
    async del(...keys) {
      this.guard();
      return keys.filter((k) => data.delete(k)).length;
    },
    async incr(key) {
      this.guard();
      const entry = live(key);
      const next = Number(entry?.value ?? 0) + 1;
      data.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },
    async incrWindow(key, windowMs) {
      this.guard();
      const entry = live(key);
      const count = Number(entry?.value ?? 0) + 1;
      const expiresAt = entry?.expiresAt ?? now() + windowMs;
      data.set(key, { value: String(count), expiresAt });
      return { count, ttlMs: expiresAt - now() };
    },
    async ping() {
      this.guard();
      return 'PONG';
    },
    async quit() {},
  };
}
