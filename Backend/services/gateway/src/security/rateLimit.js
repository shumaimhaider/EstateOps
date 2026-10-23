/**
 * A fixed-window rate limiter, in memory. Each gateway replica counts on its own, which is a safe
 * upper bound (the real limit is at most replicas x max). A shared store (Redis) makes it exact
 * when that is needed. Old windows are swept so memory stays bounded.
 */
export function createRateLimiter({ windowMs = 60_000, max, now = () => Date.now() }) {
  const hits = new Map();
  let lastSweep = now();
  return {
    /** @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }} */
    take(key) {
      const t = now();
      if (t - lastSweep > windowMs) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        lastSweep = t;
      }
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
      };
    },
    size: () => hits.size,
  };
}

/**
 * The same limiter, counted in Redis so every gateway replica shares one count and the limit is
 * exact however many replicas run. If Redis is out, each replica falls back to its own in-memory
 * count (a safe upper bound), so rate limiting never takes the gateway down.
 */
export function createSharedRateLimiter({ cache, scope, max, windowMs = 60_000, fallback }) {
  return {
    async take(key) {
      const hit = await cache.hit(`rl:${scope}:${key}`, windowMs);
      if (hit.skipped) return fallback.take(key);
      return {
        allowed: hit.count <= max,
        remaining: Math.max(0, max - hit.count),
        retryAfterSeconds: Math.max(1, Math.ceil(hit.ttlMs / 1000)),
      };
    },
  };
}

/** Express middleware: 429 with Retry-After when the key is over its limit. */
export const rateLimit = (limiter, keyOf) => async (req, res, next) => {
  const result = await limiter.take(keyOf(req));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  if (result.allowed) return next();
  res.set('Retry-After', String(result.retryAfterSeconds));
  res.status(429).json({
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Try again shortly.',
    details: [],
  });
};
