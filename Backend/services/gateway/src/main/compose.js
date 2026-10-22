import { randomUUID } from 'node:crypto';
import express from 'express';
import { UnauthenticatedError } from '@estateops/kernel';
import { errorMiddleware } from '@estateops/platform';
import { forward } from '../routing/proxy.js';
import { isPublic, resolveService } from '../routing/routes.js';
import { cors } from '../security/cors.js';
import { securityHeaders } from '../security/headers.js';
import { createRateLimiter, rateLimit } from '../security/rateLimit.js';

const probe = async (url, timeoutMs) => {
  try {
    const res = await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
};

/**
 * The single entry point. It checks the signed-in person (the services check again), limits how
 * fast one person or one address can call, answers CORS, and streams each request to the service
 * that owns the path. It holds no data and no business rules.
 */
export function composeGateway({
  upstreams,
  verifier,
  logger,
  corsOrigins = [],
  perUserPerMinute = 600,
  perAddressPerMinute = 60,
  upstreamTimeoutMs = 30_000,
  hsts = false,
  now,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const userLimiter = createRateLimiter({ max: perUserPerMinute, now });
  const addressLimiter = createRateLimiter({ max: perAddressPerMinute, now });

  app.use((req, res, next) => {
    req.id = req.get('x-request-id') ?? randomUUID();
    res.set('x-request-id', req.id);
    next();
  });
  app.use(securityHeaders({ hsts }));
  app.use(cors(corsOrigins));

  app.get('/health/live', (_req, res) => res.json({ service: 'gateway', status: 'live' }));
  app.get('/health/ready', (_req, res) => res.json({ service: 'gateway', status: 'ready' }));
  // for operators: is every service answering?
  app.get('/health/services', async (_req, res) => {
    const entries = await Promise.all(
      Object.entries(upstreams).map(async ([name, url]) => [name, await probe(url, 2_000)]),
    );
    const services = Object.fromEntries(entries);
    res.status(entries.every(([, s]) => s === 'up') ? 200 : 503).json({ gateway: 'up', services });
  });

  // unauthenticated calls (sign-in) are limited by address; everything else by person
  app.use('/api', (req, res, next) =>
    isPublic(req.path === '/' ? req.originalUrl : req.originalUrl)
      ? rateLimit(addressLimiter, (r) => r.ip)(req, res, next)
      : next(),
  );
  app.use('/api', async (req, _res, next) => {
    if (isPublic(req.originalUrl)) return next();
    const match = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
    if (!match) throw new UnauthenticatedError();
    req.auth = await verifier.verify(match[1]);
    next();
  });
  app.use('/api', (req, res, next) =>
    req.auth
      ? rateLimit(userLimiter, (r) => `${r.auth.tenantId}:${r.auth.userId}`)(req, res, next)
      : next(),
  );

  app.use('/api', (req, res, next) => {
    const service = resolveService(req.originalUrl);
    const target = service && upstreams[service];
    if (!target) return next();
    return forward(req, res, { target, timeoutMs: upstreamTimeoutMs, logger });
  });

  // /internal and anything unknown: nothing to see
  app.use((_req, res) =>
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found', details: [] }),
  );
  app.use(errorMiddleware(logger));
  return app;
}
