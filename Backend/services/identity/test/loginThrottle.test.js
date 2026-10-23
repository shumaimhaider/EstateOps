import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoginThrottle } from '../src/auth/application/LoginThrottle.js';
import { Login } from '../src/auth/application/Login.js';
import { buildIdentityTest } from './fakes.js';

describe('sign-in throttle (Redis-backed)', () => {
  let t;
  beforeEach(async () => {
    t = await buildIdentityTest({ withCache: true });
    await t.seedOwner?.();
  });

  const attempt = (email, password = 'wrong-password', ip = '9.9.9.9') =>
    request(t.app)
      .post('/api/v1/admin/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, password });

  it('blocks a guesser after too many wrong passwords, even for an email that does not exist', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await attempt('nobody@pk.test')).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect((await attempt('nobody@pk.test')).body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('counts per network address too, so moving between accounts does not help', async () => {
    const throttle = new LoginThrottle({ cache: t.cache, maxPerEmail: 100, maxPerAddress: 5 });
    for (let i = 0; i < 5; i += 1) await throttle.failed({ email: `u${i}@pk.test`, ip: '5.5.5.5' });
    await expect(
      throttle.assertAllowed({ email: 'fresh@pk.test', ip: '5.5.5.5' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    await expect(
      throttle.assertAllowed({ email: 'fresh@pk.test', ip: '6.6.6.6' }),
    ).resolves.toBeUndefined();
  });

  it('forgives a correct password and lets the window run out', async () => {
    const throttle = new LoginThrottle({ cache: t.cache, maxPerEmail: 3, windowMs: 60_000 });
    const who = { email: 'Owner@PK.test ', ip: '1.1.1.1' };
    await throttle.failed(who);
    await throttle.failed(who);
    await throttle.succeeded(who);
    await throttle.failed(who);
    await expect(throttle.assertAllowed(who)).resolves.toBeUndefined(); // the count restarted
    await throttle.failed(who);
    await throttle.failed(who);
    await expect(throttle.assertAllowed({ ...who, email: 'owner@pk.test' })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    }); // same address, case ignored
    t.clock.advance(61_000);
    await expect(throttle.assertAllowed(who)).resolves.toBeUndefined(); // the window ran out
  });

  it('does not block anyone when Redis is down', async () => {
    t.cacheClient.failing = true;
    for (let i = 0; i < 15; i += 1) expect((await attempt('nobody@pk.test')).status).toBe(401);
  });

  it('is only used when a cache is configured', async () => {
    const plain = await buildIdentityTest();
    for (let i = 0; i < 12; i += 1) {
      const res = await request(plain.app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'nobody@pk.test', password: 'x' });
      expect(res.status).toBe(401);
    }
    expect(new Login({ ...plain.deps, throttle: null })).toBeTruthy();
  });
});
