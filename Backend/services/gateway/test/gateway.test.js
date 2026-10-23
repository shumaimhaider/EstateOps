import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCache, createMemoryClient } from '@estateops/platform';
import { createTestAuth } from '@estateops/platform/testing';
import { composeGateway } from '../src/main/compose.js';
import { isPublic, resolveService } from '../src/routing/routes.js';
import { createRateLimiter } from '../src/security/rateLimit.js';

const A = '/api/v1/admin';
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/** A stub service that echoes what the gateway sent, so tests see exactly what an upstream receives. */
const stubService = (name) =>
  new Promise((resolve) => {
    const app = express();
    app.get('/health/ready', (_req, res) => res.json({ ok: true }));
    app.get('*path', (req, res, next) => (req.path.endsWith('/slow') ? undefined : next()));
    app.use(express.raw({ type: () => true }));
    app.use((req, res) => {
      res.status(req.path.endsWith('/teapot') ? 418 : 200).json({
        service: name,
        method: req.method,
        url: req.originalUrl,
        internalToken: req.get('x-internal-token') ?? null,
        requestId: req.get('x-request-id'),
        body: req.body?.length ? req.body.toString() : null,
      });
    });
    const server = http
      .createServer(app)
      .listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });

describe('gateway', () => {
  const names = ['identity', 'inventory', 'customer', 'sales', 'billing', 'contract'];
  const stubs = {};
  let auth;
  let app;
  let headers;

  const build = (extra = {}) =>
    composeGateway({
      upstreams: Object.fromEntries(names.map((n) => [n, stubs[n].url])),
      verifier: auth.verifier,
      logger: silent,
      corsOrigins: ['https://portal.example.com'],
      ...extra,
    });

  beforeAll(async () => {
    for (const n of names) stubs[n] = await stubService(n);
    auth = await createTestAuth();
    headers = await auth.bearer();
    app = build();
  });
  afterAll(() => Promise.all(names.map((n) => new Promise((r) => stubs[n].server.close(r)))));

  describe('routing table', () => {
    it.each([
      ['/auth/login', 'identity'],
      ['/users/1', 'identity'],
      ['/permissions', 'identity'],
      ['/projects?x=1', 'inventory'],
      ['/units/9/block', 'inventory'],
      ['/customers', 'customer'],
      ['/payment-plans', 'sales'],
      ['/bookings', 'sales'],
      ['/bookings/1/cancel', 'sales'],
      ['/bookings/1/contracts/signed', 'contract'],
      ['/contracts/1/send', 'contract'],
      ['/installments/1/pay', 'billing'],
      ['/fine-rules/effective', 'billing'],
      ['/stats/collections', 'billing'],
      ['/checkout-sessions/abc', 'billing'],
      ['/transactions?status=failed', 'billing'],
      ['/customers/c1/payment-methods', 'billing'],
      ['/customers/c1/payment-methods/p1/activate', 'billing'],
      ['/customers/c1', 'customer'],
      ['/customers/c1/portal-access/send-link', 'identity'],
      ['/support-requests?status=open', 'customer'],
    ])('%s goes to %s', (path, service) => expect(resolveService(`${A}${path}`)).toBe(service));

    it('does not route internal or unknown paths', () => {
      expect(resolveService('/internal/events')).toBeNull();
      expect(resolveService(`${A}/bookingsx`)).toBeNull();
      expect(resolveService(`${A}/nothing`)).toBeNull();
    });

    it('only sign-in and renewal are public', () => {
      expect(isPublic(`${A}/auth/login`)).toBe(true);
      expect(isPublic(`${A}/auth/refresh?x=1`)).toBe(true);
      expect(isPublic(`${A}/auth/me`)).toBe(false);
      expect(isPublic(`${A}/users`)).toBe(false);
    });
  });

  describe('authentication', () => {
    it('refuses a call without a token', async () => {
      const res = await request(app).get(`${A}/projects`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBeDefined();
    });

    it('refuses a forged token', async () => {
      const other = await createTestAuth({ fresh: true });
      const res = await request(app)
        .get(`${A}/projects`)
        .set(await other.bearer());
      expect(res.status).toBe(401);
    });

    it('lets sign-in through without a token', async () => {
      const res = await request(app).post(`${A}/auth/login`).send({ email: 'a@b.c' });
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('identity');
    });

    it('forwards a valid call to the owning service with its body', async () => {
      const res = await request(app).post(`${A}/bookings`).set(headers).send({ unit_id: 'u1' });
      expect(res.body).toMatchObject({ service: 'sales', method: 'POST', url: `${A}/bookings` });
      expect(JSON.parse(res.body.body)).toEqual({ unit_id: 'u1' });
    });

    it('keeps the query string', async () => {
      const res = await request(app).get(`${A}/units?status=available&limit=5`).set(headers);
      expect(res.body.url).toBe(`${A}/units?status=available&limit=5`);
    });

    it('sends contract paths under a booking to the contract service, not sales', async () => {
      const res = await request(app)
        .post(`${A}/bookings/b1/contracts/pandadoc`)
        .set(headers)
        .send({});
      expect(res.body.service).toBe('contract');
    });

    it('passes upstream status codes through', async () => {
      const res = await request(app).get(`${A}/projects/teapot`).set(headers);
      expect(res.status).toBe(418);
    });
  });

  describe('request hygiene', () => {
    it('never lets a client send an internal token upstream', async () => {
      const res = await request(app)
        .get(`${A}/projects`)
        .set(headers)
        .set('x-internal-token', 'stolen');
      expect(res.body.internalToken).toBeNull();
    });

    it('generates a request id, forwards it and returns it', async () => {
      const res = await request(app).get(`${A}/projects`).set(headers);
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('keeps a request id the caller supplied', async () => {
      const res = await request(app)
        .get(`${A}/projects`)
        .set(headers)
        .set('x-request-id', 'trace-1');
      expect(res.headers['x-request-id']).toBe('trace-1');
      expect(res.body.requestId).toBe('trace-1');
    });

    it('sets safe headers and hides the framework', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('answers 404 for internal and unknown routes, even with a token', async () => {
      expect((await request(app).post('/internal/events').set(headers).send({})).status).toBe(404);
      expect((await request(app).get(`${A}/nothing`).set(headers)).status).toBe(404);
    });
  });

  describe('CORS', () => {
    it('answers a preflight from a listed origin', async () => {
      const res = await request(app)
        .options(`${A}/bookings`)
        .set('Origin', 'https://portal.example.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://portal.example.com');
      expect(res.headers['access-control-allow-headers']).toContain('Idempotency-Key');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('gives no CORS headers to an unlisted origin', async () => {
      const res = await request(app)
        .get(`${A}/projects`)
        .set(headers)
        .set('Origin', 'https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate limiting shared through a cache', () => {
    it('counts one person across two replicas, so the limit is exact', async () => {
      const client = createMemoryClient();
      const cache = createCache({ client, logger: silent });
      const a = build({ cache, perUserPerMinute: 4 });
      const b = build({ cache, perUserPerMinute: 4 });
      const statuses = [];
      for (let i = 0; i < 6; i += 1)
        statuses.push(
          (
            await request(i % 2 ? a : b)
              .get(`${A}/projects`)
              .set(headers)
          ).status,
        );
      expect(statuses.filter((s) => s === 200)).toHaveLength(4);
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
      const limited = await request(a).get(`${A}/projects`).set(headers);
      expect(limited.headers['retry-after']).toBeDefined();
    });

    it('falls back to each replica’s own count when the cache is down, and keeps serving', async () => {
      const client = createMemoryClient();
      const cache = createCache({ client, logger: silent });
      const app = build({ cache, perUserPerMinute: 3 });
      client.failing = true;
      const statuses = [];
      for (let i = 0; i < 5; i += 1)
        statuses.push((await request(app).get(`${A}/projects`).set(headers)).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    });
  });

  describe('rate limiting', () => {
    it('limits one person without affecting another', async () => {
      const limited = build({ perUserPerMinute: 3 });
      const first = await auth.bearer({ userId: '00000000-0000-4000-8000-000000000001' });
      const second = await auth.bearer({ userId: '00000000-0000-4000-8000-000000000002' });
      const statuses = [];
      for (let i = 0; i < 5; i += 1)
        statuses.push((await request(limited).get(`${A}/projects`).set(first)).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
      expect((await request(limited).get(`${A}/projects`).set(second)).status).toBe(200);
      const blocked = await request(limited).get(`${A}/projects`).set(first);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    });

    it('limits sign-in attempts by address', async () => {
      const limited = build({ perAddressPerMinute: 2 });
      const codes = [];
      for (let i = 0; i < 3; i += 1)
        codes.push((await request(limited).post(`${A}/auth/login`).send({})).status);
      expect(codes).toEqual([200, 200, 429]);
    });

    it('opens a new window after the time passes', () => {
      let t = 0;
      const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
      expect(limiter.take('k').allowed).toBe(true);
      expect(limiter.take('k').allowed).toBe(false);
      t = 1001;
      expect(limiter.take('k').allowed).toBe(true);
    });

    it('forgets old windows so memory stays bounded', () => {
      let t = 0;
      const limiter = createRateLimiter({ windowMs: 1000, max: 5, now: () => t });
      for (let i = 0; i < 100; i += 1) limiter.take(`k${i}`);
      t = 5000;
      limiter.take('fresh');
      expect(limiter.size()).toBe(1);
    });
  });

  describe('customer portal routes', () => {
    const P = '/api/v1/portal';
    it.each([
      ['/auth/login', 'identity'],
      ['/auth/change-password', 'identity'],
      ['/properties', 'sales'],
      ['/properties/p1', 'sales'],
      ['/properties/p1/invoices', 'billing'],
      ['/properties/p1/contracts', 'contract'],
      ['/invoices/i1/checkout-session', 'billing'],
      ['/checkout-sessions/c1', 'billing'],
      ['/payment-methods/setup-session', 'billing'],
      ['/transactions?limit=5', 'billing'],
      ['/contracts/k1/signing-session', 'contract'],
      ['/profile', 'customer'],
      ['/support-requests/s1/messages', 'customer'],
    ])('%s goes to %s', (path, service) => expect(resolveService(`${P}${path}`)).toBe(service));

    it('lets only sign-in and password links be used without a token', () => {
      for (const p of ['login', 'refresh', 'logout', 'forgot-password', 'set-password'])
        expect(isPublic(`${P}/auth/${p}`)).toBe(true);
      expect(isPublic(`${P}/auth/me`)).toBe(false);
      expect(isPublic(`${P}/auth/change-password`)).toBe(false);
      expect(isPublic(`${P}/properties`)).toBe(false);
    });

    it('forwards a sign-in without a token, limited by address, and refuses other portal calls without one', async () => {
      const ok = await request(app)
        .post(`${P}/auth/login`)
        .send({ tenant: 'pk', email: 'a@b.c', password: 'x' });
      expect(ok.body).toMatchObject({ service: 'identity', url: `${P}/auth/login` });
      expect((await request(app).get(`${P}/properties`)).status).toBe(401);
      const customer = await auth.customerBearer({
        customerId: '00000000-0000-4000-8000-000000000301',
      });
      const res = await request(app).get(`${P}/properties`).set(customer);
      expect(res.body).toMatchObject({ service: 'sales', url: `${P}/properties` });
      const tight = build({ perAddressPerMinute: 2 });
      const statuses = [];
      for (let i = 0; i < 4; i += 1)
        statuses.push((await request(tight).post(`${P}/auth/login`).send({})).status);
      expect(statuses).toEqual([200, 200, 429, 429]);
    });
  });

  describe('provider webhooks', () => {
    it('streams the Stripe webhook to billing byte for byte with no sign-in, and refuses other methods and paths', async () => {
      const body = JSON.stringify({ id: 'evt_1', note: '  spaced   body  ' });
      const res = await request(app)
        .post('/webhooks/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', 't=1,v1=abc')
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ service: 'billing', url: '/webhooks/stripe', body });
      expect((await request(app).get('/webhooks/stripe')).status).toBe(404);
      expect((await request(app).post('/webhooks/unknown').send({})).status).toBe(404);
    });
    it('limits webhooks by address, with a wider allowance than sign-in', async () => {
      const tight = build({ perAddressPerMinute: 1 });
      const statuses = [];
      for (let i = 0; i < 25; i += 1)
        statuses.push((await request(tight).post('/webhooks/stripe').send({})).status);
      expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
      expect(statuses).toContain(429);
    });
  });

  describe('upstream failures', () => {
    it('answers 502 when a service is down', async () => {
      const down = composeGateway({
        upstreams: {
          ...Object.fromEntries(names.map((n) => [n, stubs[n].url])),
          billing: 'http://127.0.0.1:1',
        },
        verifier: auth.verifier,
        logger: silent,
      });
      const res = await request(down).get(`${A}/installments`).set(headers);
      expect(res.status).toBe(502);
      expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('answers 504 when a service is too slow', async () => {
      const slow = build({ upstreamTimeoutMs: 150 });
      const res = await request(slow).get(`${A}/projects/slow`).set(headers);
      expect(res.status).toBe(504);
      expect(res.body.code).toBe('UPSTREAM_TIMEOUT');
    });
  });

  describe('health', () => {
    it('reports live and ready without a token', async () => {
      expect((await request(app).get('/health/live')).body.status).toBe('live');
      expect((await request(app).get('/health/ready')).status).toBe(200);
    });

    it('reports every service, and 503 when one is down', async () => {
      const ok = await request(app).get('/health/services');
      expect(ok.status).toBe(200);
      expect(Object.keys(ok.body.services).sort()).toEqual([...names].sort());
      const down = composeGateway({
        upstreams: {
          ...Object.fromEntries(names.map((n) => [n, stubs[n].url])),
          sales: 'http://127.0.0.1:1',
        },
        verifier: auth.verifier,
        logger: silent,
      });
      const bad = await request(down).get('/health/services');
      expect(bad.status).toBe(503);
      expect(bad.body.services.sales).toBe('down');
    });
  });
});
