import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createCache,
  createCacheFromConfig,
  createMemoryClient,
  createNullCache,
  createRedisClient,
} from '../src/index.js';

const logger = { warn: vi.fn(), info: vi.fn() };
const tenant = 't1';

describe('cache (memory client)', () => {
  const make = (over = {}) => {
    let t = 1_000_000;
    const client = createMemoryClient({ now: () => t });
    const cache = createCache({ client, logger, now: () => t, ...over });
    return { client, cache, tick: (ms) => (t += ms) };
  };

  it('loads once, serves the rest from the cache, and expires by time', async () => {
    const { cache, tick } = make();
    const loader = vi.fn(async () => ({ total: 5 }));
    const args = { ns: 'stats', tenantId: tenant, key: 'all', ttlMs: 1000 };
    expect(await cache.remember(args, loader)).toEqual({ total: 5 });
    expect(await cache.remember(args, loader)).toEqual({ total: 5 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.stats).toMatchObject({ hits: 1, misses: 1 });
    tick(1500);
    await cache.remember(args, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidates a tenant’s namespace by bumping its version, leaving others alone', async () => {
    const { cache } = make();
    const loader = vi.fn(async () => Math.random());
    const a = await cache.remember({ ns: 'stats', tenantId: 't1', key: 'k' }, loader);
    const other = await cache.remember({ ns: 'stats', tenantId: 't2', key: 'k' }, loader);
    const unrelated = await cache.remember({ ns: 'projects', tenantId: 't1', key: 'k' }, loader);
    await cache.bump('stats', 't1');
    expect(await cache.remember({ ns: 'stats', tenantId: 't1', key: 'k' }, loader)).not.toBe(a);
    expect(await cache.remember({ ns: 'stats', tenantId: 't2', key: 'k' }, loader)).toBe(other);
    expect(await cache.remember({ ns: 'projects', tenantId: 't1', key: 'k' }, loader)).toBe(
      unrelated,
    );
    expect(await cache.version('stats', 't1')).toBe(1);
  });

  it('shares one load between simultaneous misses', async () => {
    const { cache } = make();
    let release;
    const loader = vi.fn(() => new Promise((r) => (release = r)));
    const calls = Array.from({ length: 20 }, () =>
      cache.remember({ ns: 'n', tenantId: tenant, key: 'k' }, loader),
    );
    await new Promise((r) => setTimeout(r, 5));
    release({ ok: true });
    expect((await Promise.all(calls)).every((v) => v.ok)).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('never caches a missing value, and passes loader errors through', async () => {
    const { cache } = make();
    const none = vi.fn(async () => undefined);
    await cache.remember({ ns: 'n', tenantId: tenant, key: 'none' }, none);
    await cache.remember({ ns: 'n', tenantId: tenant, key: 'none' }, none);
    expect(none).toHaveBeenCalledTimes(2);
    await expect(
      cache.remember({ ns: 'n', tenantId: tenant, key: 'bad' }, async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('db down');
    // a failed load is not remembered as in flight
    expect(await cache.remember({ ns: 'n', tenantId: tenant, key: 'bad' }, async () => 7)).toBe(7);
  });

  it('keeps serving from the loader when Redis fails, and stops trying for a while', async () => {
    const { cache, client, tick } = make({ breakerMs: 5_000 });
    client.failing = true;
    const loader = vi.fn(async () => 'fresh');
    expect(await cache.remember({ ns: 'n', tenantId: tenant, key: 'k' }, loader)).toBe('fresh');
    expect(cache.stats.errors).toBeGreaterThan(0);
    const errors = cache.stats.errors;
    await cache.remember({ ns: 'n', tenantId: tenant, key: 'k' }, loader);
    expect(cache.stats.errors).toBe(errors); // circuit open: no new attempts
    expect(cache.stats.bypassed).toBeGreaterThan(0);
    expect(await cache.available()).toBe(false);
    expect(await cache.bump('n', tenant)).toBeNull();
    client.failing = false;
    tick(6_000);
    expect(await cache.available()).toBe(true);
  });

  it('counts hits in a window and clears them; with Redis down it blocks nobody', async () => {
    const { cache, client, tick } = make();
    expect((await cache.hit('login:a', 1000)).count).toBe(1);
    expect((await cache.hit('login:a', 1000)).count).toBe(2);
    expect(await cache.count('login:a')).toBe(2);
    tick(1500);
    expect((await cache.hit('login:a', 1000)).count).toBe(1);
    await cache.clear('login:a');
    expect(await cache.count('login:a')).toBe(0);
    client.failing = true;
    expect(await cache.hit('login:a', 1000)).toMatchObject({ count: 0, skipped: true });
  });

  it('does nothing, safely, with no Redis configured', async () => {
    const cache = createNullCache();
    const loader = vi.fn(async () => 1);
    await cache.remember({ ns: 'n', tenantId: tenant, key: 'k' }, loader);
    await cache.remember({ ns: 'n', tenantId: tenant, key: 'k' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(await cache.available()).toBe(false);
    expect((await cache.hit('k', 1000)).skipped).toBe(true);
    await cache.close();
    const built = createCacheFromConfig({ CACHE_TTL_MS: 1000 }, { logger });
    expect(await built.available()).toBe(false);
  });
});

const REDIS = process.env.TEST_REDIS_URL ?? 'redis://localhost:56379';
const redisUp = await (async () => {
  const client = createRedisClient(REDIS, { retryStrategy: () => null, commandTimeout: 300 });
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    await client.quit();
  }
})();

describe.skipIf(!redisUp)('cache on real Redis', () => {
  let client;
  let cache;
  const prefix = `test-${Math.random().toString(36).slice(2, 8)}`;
  beforeAll(() => {
    client = createRedisClient(REDIS);
    cache = createCache({ client, logger, prefix });
  });
  afterAll(() => cache.close());

  it('caches, versions and expires on a real server', async () => {
    const loader = vi.fn(async () => ({ n: 1 }));
    const a = { ns: 'stats', tenantId: 't1', key: 'k', ttlMs: 400 };
    await cache.remember(a, loader);
    await cache.remember(a, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.bump('stats', 't1');
    await cache.remember(a, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 500));
    await cache.remember(a, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('counts atomically across many parallel callers, and the window expires', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.hit('burst', 300)));
    expect(results.map((r) => r.count).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(results.every((r) => r.ttlMs > 0 && r.ttlMs <= 300)).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect((await cache.hit('burst', 300)).count).toBe(1);
  });

  it('fails open when the server cannot be reached', async () => {
    const dead = createCache({
      client: createRedisClient('redis://127.0.0.1:1', { retryStrategy: () => null }),
      logger,
      prefix,
    });
    expect(await dead.remember({ ns: 'n', tenantId: 't', key: 'k' }, async () => 'from db')).toBe(
      'from db',
    );
    expect((await dead.hit('k', 1000)).skipped).toBe(true);
    await dead.close();
  });
});
