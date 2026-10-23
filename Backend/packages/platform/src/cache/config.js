import { z } from 'zod';
import { createCache } from './cache.js';
import { createMemoryClient, createRedisClient } from './clients.js';

/** Environment for the cache. Without REDIS_URL the service runs with no cache at all. */
export const CACHE_ENV = {
  REDIS_URL: z.string().optional(),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
};

export function createCacheFromConfig(config, { logger, client } = {}) {
  const redis = client ?? (config.REDIS_URL ? createRedisClient(config.REDIS_URL) : null);
  return createCache({ client: redis, logger, defaultTtlMs: config.CACHE_TTL_MS, prefix: 'eo' });
}

export { createMemoryClient };
