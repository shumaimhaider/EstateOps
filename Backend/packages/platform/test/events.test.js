import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import {
  MAX_ATTEMPTS,
  backoffMs,
  createEventConsumerRouter,
  createInMemoryBus,
  createRelay,
  createServiceApp,
  silentLogger,
} from '../src/index.js';
import {
  TEST_INTERNAL_TOKEN,
  TEST_TENANT_A,
  createTestAuth,
  deliverEvent,
} from '../src/testing/index.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const booked = () =>
  buildEvent({
    type: EVENT.UNIT_BOOKED,
    tenantId: TEST_TENANT_A,
    producer: 'inventory',
    data: { booking_id: uuid(1), unit_id: uuid(2) },
  });
const confirmed = () =>
  buildEvent({
    type: EVENT.BOOKING_CONFIRMED,
    tenantId: TEST_TENANT_A,
    producer: 'sales',
    data: {
      booking_id: uuid(1),
      unit: { id: uuid(2), unit_no: 'A-1', kind: 'plot', project_id: uuid(3), project_name: 'P' },
      customer: { id: uuid(4), full_name: 'Ali', phone: null, email: null },
      plan: { name: 'p', down_pct: 20, installment_count: 12 },
      total_price: 1000,
      currency: 'PKR',
      booked_at: '2026-10-21',
    },
  });

describe('backoff', () => {
  it('doubles from 500 ms and caps at 5 minutes', () => {
    expect(backoffMs(1)).toBe(500);
    expect(backoffMs(2)).toBe(1000);
    expect(backoffMs(4)).toBe(4000);
    expect(backoffMs(30)).toBe(300_000);
  });
});

function fakeStore(rows) {
  const state = { published: [], failed: [] };
  return {
    state,
    claim: async () => rows.splice(0),
    markPublished: async (id, deliveredTo) => void state.published.push({ id, deliveredTo }),
    markFailed: async (id, info) => void state.failed.push({ id, ...info }),
  };
}

describe('outbox relay', () => {
  const subscribers = {
    billing: 'http://billing',
    contract: 'http://contract',
    sales: 'http://sales',
  };

  it('delivers an event to every consumer of its type, with the internal token, then publishes it', async () => {
    const calls = [];
    const store = fakeStore([{ id: 'r1', event: confirmed(), attempts: 0, deliveredTo: [] }]);
    const relay = createRelay({
      store,
      subscribers,
      internalToken: 'secret-token',
      logger: silentLogger,
      fetchImpl: async (url, init) => {
        calls.push({ url, token: init.headers['x-internal-token'] });
        return { ok: true, status: 200 };
      },
    });
    expect(await relay.tick()).toEqual({ published: 1, retry: 0, dead: 0 });
    expect(calls.map((c) => c.url).sort()).toEqual([
      'http://billing/internal/events',
      'http://contract/internal/events',
    ]);
    expect(calls.every((c) => c.token === 'secret-token')).toBe(true);
    expect(store.state.published[0].deliveredTo.sort()).toEqual(['billing', 'contract']);
  });

  it('retries only the consumers that failed, with backoff, and keeps who already got it', async () => {
    const store = fakeStore([{ id: 'r1', event: confirmed(), attempts: 0, deliveredTo: [] }]);
    const now = new Date('2026-10-21T10:00:00Z');
    const relay = createRelay({
      store,
      subscribers,
      internalToken: 't',
      logger: silentLogger,
      now: () => now,
      fetchImpl: async (url) =>
        url.startsWith('http://contract') ? { ok: false, status: 503 } : { ok: true, status: 200 },
    });
    expect(await relay.tick()).toEqual({ published: 0, retry: 1, dead: 0 });
    const failed = store.state.failed[0];
    expect(failed.deliveredTo).toEqual(['billing']);
    expect(failed.attempts).toBe(1);
    expect(failed.nextAttemptAt.getTime()).toBe(now.getTime() + 500);
    expect(failed.dead).toBe(false);

    // second round: only contract is attempted
    const urls = [];
    const again = fakeStore([
      { id: 'r1', event: confirmed(), attempts: 1, deliveredTo: ['billing'] },
    ]);
    await createRelay({
      store: again,
      subscribers,
      internalToken: 't',
      logger: silentLogger,
      fetchImpl: async (url) => (urls.push(url), { ok: true, status: 200 }),
    }).tick();
    expect(urls).toEqual(['http://contract/internal/events']);
    expect(again.state.published).toHaveLength(1);
  });

  it('dead-letters after the maximum number of attempts', async () => {
    const store = fakeStore([
      { id: 'r1', event: booked(), attempts: MAX_ATTEMPTS - 1, deliveredTo: [] },
    ]);
    const relay = createRelay({
      store,
      subscribers,
      internalToken: 't',
      logger: silentLogger,
      fetchImpl: async () => {
        throw new Error('refused');
      },
    });
    expect(await relay.tick()).toEqual({ published: 0, retry: 0, dead: 1 });
    expect(store.state.failed[0]).toMatchObject({ dead: true, attempts: MAX_ATTEMPTS });
    expect(store.state.failed[0].error).toContain('refused');
  });

  it('treats a missing subscriber URL as a failure to retry, and an event with no consumers as published', async () => {
    const lonely = fakeStore([{ id: 'r1', event: booked(), attempts: 0, deliveredTo: [] }]);
    const relay = createRelay({
      store: lonely,
      subscribers: {},
      internalToken: 't',
      logger: silentLogger,
      fetchImpl: vi.fn(),
    });
    expect((await relay.tick()).retry).toBe(1);

    const noConsumers = buildEvent({
      type: EVENT.PAYMENT_RECORDED,
      tenantId: TEST_TENANT_A,
      producer: 'billing',
      data: {
        payment_id: uuid(1),
        installment_id: uuid(2),
        booking_id: uuid(3),
        amount: 1,
        source: 'manual',
      },
    });
    const none = fakeStore([{ id: 'r2', event: noConsumers, attempts: 0, deliveredTo: [] }]);
    const fetchImpl = vi.fn();
    await createRelay({
      store: none,
      subscribers,
      internalToken: 't',
      logger: silentLogger,
      fetchImpl,
    }).tick();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(none.state.published).toHaveLength(1);
  });
});

describe('event consumer router', () => {
  async function build(handler) {
    const auth = await createTestAuth();
    return createServiceApp({
      name: 'consumer',
      logger: silentLogger,
      verifier: auth.verifier,
      internalToken: TEST_INTERNAL_TOKEN,
      internalRouters: [
        createEventConsumerRouter({
          logger: silentLogger,
          handlers: { [EVENT.UNIT_BOOKED]: handler },
        }),
      ],
    });
  }

  it('runs the handler for its event, reports duplicates, and needs the internal token', async () => {
    const handler = vi.fn(async () => ({ duplicate: false }));
    const app = await build(handler);
    const event = booked();
    expect((await deliverEvent(app, event)).body).toEqual({ ok: true, duplicate: false });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.id, type: EVENT.UNIT_BOOKED }),
    );
    expect((await request(app).post('/internal/events').send(event)).status).toBe(401);
  });

  it('acknowledges events it does not handle, rejects bad payloads, and retries on handler failure', async () => {
    const app = await build(async () => {
      throw new Error('db down');
    });
    expect((await deliverEvent(app, confirmed())).body).toEqual({ ignored: true });
    expect((await deliverEvent(app, { ...booked(), type: 'future.event' })).status).toBe(202);
    expect((await deliverEvent(app, { nonsense: true })).status).toBe(400);
    expect((await deliverEvent(app, { ...booked(), data: { booking_id: 'x' } })).status).toBe(400);
    expect((await deliverEvent(app, booked())).status).toBe(500);
  });
});

describe('in-memory bus', () => {
  it('routes by event type, delivers events produced while delivering, and fails loudly on gaps', async () => {
    const bus = createInMemoryBus();
    const seen = [];
    bus.subscribe('sales', async (event) => {
      seen.push(['sales', event.type]);
      if (event.type === EVENT.UNIT_BOOKED) bus.publish(confirmed());
    });
    bus.subscribe('billing', async (event) => void seen.push(['billing', event.type]));
    bus.subscribe('contract', async (event) => void seen.push(['contract', event.type]));
    bus.publish(booked());
    await bus.drain();
    expect(seen).toEqual([
      ['sales', EVENT.UNIT_BOOKED],
      ['billing', EVENT.BOOKING_CONFIRMED],
      ['contract', EVENT.BOOKING_CONFIRMED],
    ]);

    const empty = createInMemoryBus();
    empty.publish(booked());
    await expect(empty.drain()).rejects.toThrow(/No subscriber/);

    const loop = createInMemoryBus();
    loop.subscribe('sales', async () => loop.publish(booked()));
    loop.publish(booked());
    await expect(loop.drain({ maxEvents: 5 })).rejects.toThrow(/did not settle/);
  });
});

describe('express sanity', () => {
  it('supertest can drive a bare router', async () => {
    const app = express();
    app.get('/x', (_req, res) => res.json({ ok: 1 }));
    expect((await request(app).get('/x')).body.ok).toBe(1);
  });
});
