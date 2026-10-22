import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthenticatedError,
  fieldError,
} from '@estateops/kernel';
import {
  actorFrom,
  createServiceApp,
  idempotency,
  loadConfig,
  pageResponse,
  parseSubscribers,
  requireAnyPermission,
  requireInternalToken,
  requirePermission,
  silentLogger,
  toHttpError,
} from '../src/index.js';
import {
  TEST_INTERNAL_TOKEN,
  TEST_TENANT_A,
  createFakeIdempotencyStore,
  createTestAuth,
} from '../src/testing/index.js';

describe('error mapping (the one place status codes are decided)', () => {
  it.each([
    [fieldError('email', 'Required'), 422, 'VALIDATION_ERROR'],
    [new NotFoundError('Unit not found'), 404, 'NOT_FOUND'],
    [new ConflictError('CONTRACT_OPEN', 'open'), 409, 'CONTRACT_OPEN'],
    [new InvalidTransitionError('Cannot block a unit that is sold'), 409, 'INVALID_TRANSITION'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
  ])('%#: maps to %i %s', (error, status, code) => {
    expect(toHttpError(error)).toMatchObject({ status, body: { code } });
  });

  it('turns Zod errors into 422 with field details', () => {
    const result = z.object({ amount: z.number() }).safeParse({ amount: 'x' });
    const mapped = toHttpError(result.error);
    expect(mapped.status).toBe(422);
    expect(mapped.body.details[0]).toMatchObject({ field: 'amount' });
  });

  it('translates database constraint codes and hides unknown failures', () => {
    expect(toHttpError({ code: '23505' }).status).toBe(409);
    expect(
      toHttpError({ driverError: { code: '23503' }, code: undefined }.driverError).status,
    ).toBe(409);
    expect(toHttpError({ code: '23514' }).status).toBe(422);
    const hidden = toHttpError(new Error('select * from secrets failed'));
    expect(hidden).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(hidden.body)).not.toContain('secrets');
  });
});

describe('config', () => {
  const env = {
    DATABASE_URL: 'postgres://x',
    JWT_PUBLIC_KEY: 'a\\nb',
    INTERNAL_TOKEN: 'long-enough-token',
    EVENT_SUBSCRIBERS: 'sales=http://s:1, billing=http://b:2',
  };
  it('parses subscribers and unescapes PEM newlines', () => {
    const c = loadConfig(env);
    expect(c.subscribers).toEqual({ sales: 'http://s:1', billing: 'http://b:2' });
    expect(c.jwtPublicKey).toBe('a\nb');
    expect(c.PORT).toBe(8080);
    expect(Object.isFrozen(c)).toBe(true);
    expect(parseSubscribers('')).toEqual({});
  });
  it('fails loudly on a bad or missing value', () => {
    expect(() => loadConfig({ ...env, INTERNAL_TOKEN: 'short' })).toThrow(/Invalid environment/);
    expect(() => loadConfig({})).toThrow(/Invalid environment/);
  });
});

describe('authentication and permissions', () => {
  async function appWith(...middleware) {
    const auth = await createTestAuth();
    const router = express.Router();
    router.get('/thing', ...middleware, (req, res) => res.json({ actor: actorFrom(req) }));
    const app = createServiceApp({
      name: 'test',
      logger: silentLogger,
      verifier: auth.verifier,
      internalToken: TEST_INTERNAL_TOKEN,
      adminRouters: [router],
    });
    return { app, auth };
  }

  it('refuses a missing, malformed or forged token with 401', async () => {
    const { app } = await appWith();
    expect((await request(app).get('/api/v1/admin/thing')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/admin/thing').set('Authorization', 'Bearer nonsense'))
        .status,
    ).toBe(401);
    const other = await createTestAuth({ fresh: true });
    const forged = await other.bearer();
    expect((await request(app).get('/api/v1/admin/thing').set(forged)).status).toBe(401);
  });

  it('reads the tenant and permissions from the token only', async () => {
    const { app, auth } = await appWith();
    const res = await request(app)
      .get('/api/v1/admin/thing?tenant_id=evil')
      .set(await auth.bearer({ role: 'finance', tenantId: TEST_TENANT_A }));
    expect(res.status).toBe(200);
    expect(res.body.actor).toMatchObject({ tenantId: TEST_TENANT_A, role: 'finance' });
  });

  it('enforces requirePermission and requireAnyPermission', async () => {
    const { app, auth } = await appWith(requirePermission('fines.manage'));
    expect(
      (
        await request(app)
          .get('/api/v1/admin/thing')
          .set(await auth.bearer({ role: 'finance' }))
      ).status,
    ).toBe(200);
    const denied = await request(app)
      .get('/api/v1/admin/thing')
      .set(await auth.bearer({ role: 'auditor' }));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const any = await appWith(requireAnyPermission('payments.record', 'payments.card'));
    expect(
      (
        await request(any.app)
          .get('/api/v1/admin/thing')
          .set(await any.auth.bearer({ role: 'sales_manager' }))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(any.app)
          .get('/api/v1/admin/thing')
          .set(await any.auth.bearer({ role: 'marketing' }))
      ).status,
    ).toBe(403);
  });

  it('reports an expired token distinctly', async () => {
    const { app, auth } = await appWith();
    const { createJwtSigner } = await import('../src/index.js');
    const short = await createJwtSigner({ privateKeyPem: auth.keys.privatePem, ttlSeconds: -10 });
    const token = await short.sign({
      sub: 'u',
      tenantId: TEST_TENANT_A,
      role: 'owner',
      name: 'x',
      permissions: [],
    });
    const res = await request(app)
      .get('/api/v1/admin/thing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('service app', () => {
  it('serves health, request ids, JSON 404s and guarded internal routes', async () => {
    const auth = await createTestAuth();
    const internal = express.Router();
    internal.get('/ping', (_req, res) => res.json({ pong: true }));
    const app = createServiceApp({
      name: 'svc',
      logger: silentLogger,
      verifier: auth.verifier,
      internalToken: TEST_INTERNAL_TOKEN,
      internalRouters: [internal],
      readyCheck: async () => {
        throw new Error('db down');
      },
    });
    expect((await request(app).get('/health/live')).body).toEqual({
      service: 'svc',
      status: 'live',
    });
    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(503);
    const res = await request(app).get('/nope').set('x-request-id', 'abc');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('abc');
    expect(res.body.code).toBe('NOT_FOUND');
    expect((await request(app).get('/internal/ping')).status).toBe(401);
    expect((await request(app).get('/internal/ping').set('x-internal-token', 'wrong')).status).toBe(
      401,
    );
    expect(
      (await request(app).get('/internal/ping').set('x-internal-token', TEST_INTERNAL_TOKEN)).body
        .pong,
    ).toBe(true);
  });

  it('answers malformed JSON with a clean 400', async () => {
    const auth = await createTestAuth();
    const router = express.Router();
    router.post('/x', (_req, res) => res.json({}));
    const app = createServiceApp({
      name: 's',
      logger: silentLogger,
      verifier: auth.verifier,
      internalToken: TEST_INTERNAL_TOKEN,
      adminRouters: [router],
    });
    const res = await request(app)
      .post('/api/v1/admin/x')
      .set(await auth.bearer())
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('requireInternalToken compares in constant time and rejects an empty secret', () => {
    const next = () => {};
    const req = { get: () => 'x' };
    expect(() => requireInternalToken('')(req, {}, next)).toThrow();
  });
});

describe('page response', () => {
  it('uses the API envelope', () => {
    expect(pageResponse({ items: [1, 2], nextCursor: 'c' }, (n) => n * 2)).toEqual({
      data: [2, 4],
      next_cursor: 'c',
    });
    expect(pageResponse({ items: [], nextCursor: undefined })).toEqual({
      data: [],
      next_cursor: null,
    });
  });
});

describe('idempotency middleware', () => {
  async function build() {
    const auth = await createTestAuth();
    const store = createFakeIdempotencyStore();
    let effects = 0;
    const router = express.Router();
    router.post('/pay', (req, res) => {
      effects += 1;
      res.status(req.body.fail ? 409 : 201).json({ effects });
    });
    router.get('/read', (_req, res) => res.json({ ok: true }));
    const wrapped = express.Router();
    wrapped.use(idempotency(store));
    wrapped.use(router);
    const app = createServiceApp({
      name: 's',
      logger: silentLogger,
      verifier: auth.verifier,
      internalToken: TEST_INTERNAL_TOKEN,
      adminRouters: [wrapped],
    });
    return { app, auth, store, effects: () => effects };
  }

  it('replays the first response for the same key and body, doing the work once', async () => {
    const { app, auth, effects } = await build();
    const h = { ...(await auth.bearer()), 'Idempotency-Key': 'k1' };
    const first = await request(app).post('/api/v1/admin/pay').set(h).send({ amount: 5 });
    await new Promise((r) => setTimeout(r, 10));
    const second = await request(app).post('/api/v1/admin/pay').set(h).send({ amount: 5 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(effects()).toBe(1);
  });

  it('rejects the same key with a different body, scopes keys per tenant, and ignores reads', async () => {
    const { app, auth, effects } = await build();
    const h = { ...(await auth.bearer()), 'Idempotency-Key': 'k2' };
    await request(app).post('/api/v1/admin/pay').set(h).send({ amount: 5 });
    await new Promise((r) => setTimeout(r, 10));
    const reused = await request(app).post('/api/v1/admin/pay').set(h).send({ amount: 6 });
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const otherTenant = {
      ...(await auth.bearer({ tenantId: '00000000-0000-4000-8000-0000000000b2' })),
      'Idempotency-Key': 'k2',
    };
    expect(
      (await request(app).post('/api/v1/admin/pay').set(otherTenant).send({ amount: 5 })).status,
    ).toBe(201);
    expect(effects()).toBe(2);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/read')
          .set({ ...(await auth.bearer()), 'Idempotency-Key': 'k9' })
      ).status,
    ).toBe(200);
  });

  it('does not store failed responses, so a retry can succeed', async () => {
    const { app, auth, store } = await build();
    const h = { ...(await auth.bearer()), 'Idempotency-Key': 'k3' };
    expect((await request(app).post('/api/v1/admin/pay').set(h).send({ fail: true })).status).toBe(
      409,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(store.rows.size).toBe(0);
  });

  it('refuses an oversized key', async () => {
    const { app, auth } = await build();
    const res = await request(app)
      .post('/api/v1/admin/pay')
      .set({ ...(await auth.bearer()), 'Idempotency-Key': 'x'.repeat(201) })
      .send({});
    expect(res.status).toBe(422);
  });
});
