import { randomUUID } from 'node:crypto';
import express from 'express';
import { requireInternalToken } from '../auth/internalToken.js';
import { authenticate, authenticateCustomer } from './auth.js';
import { idempotency } from './idempotency.js';
import { errorMiddleware } from './errorMapper.js';
import { NotFoundError } from '@estateops/kernel';

/**
 * Builds a service's Express app with the shared edge behaviour: request ids, JSON body, health
 * checks, authentication, internal routes and the single error mapper.
 *  - `publicRouters` are mounted at /api/v1/admin without authentication (sign-in).
 *  - `adminRouters` are mounted at /api/v1/admin behind authentication (and idempotency replay
 *    when an `idempotencyStore` is given).
 *  - `internalRouters` are mounted at /internal behind the internal token.
 *  - `portalPublicRouters` / `portalRouters` are mounted at /api/v1/portal (the second behind a customer's token).
 *  - `webhookRouters` are mounted at /webhooks without a session (they check the sender's signature).
 */
export function createServiceApp({
  name,
  logger,
  verifier,
  internalToken,
  publicRouters = [],
  adminRouters = [],
  internalRouters = [],
  webhookRouters = [],
  portalPublicRouters = [],
  portalRouters = [],
  idempotencyStore = null,
  readyCheck = async () => {},
  jsonLimit = '1mb',
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    req.id = req.get('x-request-id') ?? randomUUID();
    res.set('x-request-id', req.id);
    next();
  });
  // The raw bytes are kept for webhooks: a signature is computed over exactly what was sent.
  app.use(
    express.json({
      limit: jsonLimit,
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get('/health/live', (_req, res) => res.json({ service: name, status: 'live' }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await readyCheck();
      res.json({ service: name, status: 'ready' });
    } catch (error) {
      logger.warn({ err: error }, 'not ready');
      res.status(503).json({ service: name, status: 'not_ready' });
    }
  });

  // Webhooks: no user session; each router verifies the sender's signature itself.
  for (const router of webhookRouters) app.use('/webhooks', router);
  for (const router of publicRouters) app.use('/api/v1/admin', router);
  if (adminRouters.length > 0) {
    const guards = [
      authenticate(verifier),
      ...(idempotencyStore ? [idempotency(idempotencyStore)] : []),
    ];
    app.use('/api/v1/admin', ...guards, ...adminRouters);
  }
  // the customer portal's own API: sign-in is open, everything else needs a customer's token
  for (const router of portalPublicRouters) app.use('/api/v1/portal', router);
  if (portalRouters.length > 0) {
    app.use(
      '/api/v1/portal',
      authenticateCustomer(verifier),
      ...(idempotencyStore ? [idempotency(idempotencyStore)] : []),
      ...portalRouters,
    );
  }
  if (internalRouters.length > 0) {
    app.use('/internal', requireInternalToken(internalToken), ...internalRouters);
  }

  app.use(() => {
    throw new NotFoundError('Route not found');
  });
  app.use(errorMiddleware(logger));
  return app;
}
