import { describe, expect, it, vi } from 'vitest';
import { buildEvent, EVENT } from '@estateops/contracts';
import {
  createInMemoryKafka,
  createKafkaConsumer,
  createKafkaRelay,
  DLQ_TOPIC,
  messageKey,
  topicOf,
  topicsFor,
} from '../src/index.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const event = (over = {}) =>
  buildEvent({
    type: EVENT.UNIT_BOOKED,
    tenantId: id(1),
    producer: 'inventory',
    data: { booking_id: id(2), unit_id: id(3) },
    ...over,
  });

const fakeStore = (rows) => {
  const state = { published: [], failed: [] };
  return {
    state,
    claim: async () => rows,
    markPublished: async (rid) => void state.published.push(rid),
    markFailed: async (rid, info) => void state.failed.push({ rid, ...info }),
  };
};

describe('topics and keys', () => {
  it('names topics per event type and derives a stable key', () => {
    expect(topicOf('booking.confirmed')).toBe('estateops.booking.confirmed');
    expect(messageKey(event())).toBe(id(2));
    expect(
      messageKey(
        event({
          type: EVENT.CUSTOMER_UPSERTED,
          data: { customer_id: id(9), full_name: 'A', phone: null, email: null },
        }),
      ),
    ).toBe(id(9));
    expect(
      messageKey(
        event({
          type: EVENT.TENANT_UPSERTED,
          data: {
            slug: 's',
            name: 'n',
            currency: 'PKR',
            locale: 'en',
            time_zone: 'UTC',
            area_unit: 'marla',
          },
        }),
      ),
    ).toBe(id(1));
  });
  it('lists the topics a service consumes, optionally limited to its handlers', () => {
    expect(topicsFor('sales')).toContain('estateops.unit.booked');
    expect(topicsFor('sales', ['unit.booked'])).toEqual(['estateops.unit.booked']);
    expect(topicsFor('identity')).toEqual(['estateops.customer.upserted']);
  });
});

describe('kafka relay', () => {
  it('publishes each event to its topic, keyed, and marks it published', async () => {
    const kafka = createInMemoryKafka();
    const e = event();
    const store = fakeStore([{ id: 'r1', event: e, attempts: 0 }]);
    const counts = await createKafkaRelay({ store, producer: kafka.producer, logger }).tick();
    expect(counts).toEqual({ published: 1, retry: 0, dead: 0 });
    const [m] = kafka.messages('estateops.unit.booked');
    expect(m.key).toBe(id(2));
    expect(JSON.parse(m.value)).toEqual(e);
    expect(m.headers['event-id']).toBe(e.id);
    expect(store.state.published).toEqual(['r1']);
  });
  it('keeps the row for retry when the broker fails, and dead-letters after too many attempts', async () => {
    const kafka = createInMemoryKafka();
    kafka.failNextSend(new Error('down'), 2);
    const store = fakeStore([
      { id: 'a', event: event(), attempts: 0 },
      { id: 'b', event: event(), attempts: 9 },
    ]);
    const counts = await createKafkaRelay({
      store,
      producer: kafka.producer,
      logger,
      now: () => new Date(0),
    }).tick();
    expect(counts).toEqual({ published: 0, retry: 1, dead: 1 });
    expect(store.state.failed.map((f) => [f.rid, f.dead, f.attempts])).toEqual([
      ['a', false, 1],
      ['b', true, 10],
    ]);
    expect(store.state.failed[0].nextAttemptAt.getTime()).toBeGreaterThan(0);
  });
});

describe('kafka consumer', () => {
  const msg = (value, key = 'k') => ({
    topic: 'estateops.unit.booked',
    message: { key, value: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) },
  });
  const make = (handlers, extra = {}) => {
    const kafka = createInMemoryKafka();
    const consumer = createKafkaConsumer({
      service: 'sales',
      consumer: {},
      producer: kafka.producer,
      handlers,
      logger,
      wait: async () => {},
      ...extra,
    });
    return { kafka, consumer };
  };

  it('hands parsed events to the handler', async () => {
    const handler = vi.fn();
    const { consumer } = make({ [EVENT.UNIT_BOOKED]: handler });
    const e = event();
    expect(await consumer.handle(msg(e))).toBe('handled');
    expect(handler).toHaveBeenCalledWith(e);
  });
  it('retries a failing handler, then succeeds', async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error('tenant unknown')).mockResolvedValue();
    const { consumer, kafka } = make({ [EVENT.UNIT_BOOKED]: handler });
    expect(await consumer.handle(msg(event()))).toBe('handled');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(kafka.messages(DLQ_TOPIC)).toHaveLength(0);
  });
  it('sends a message that keeps failing to the dead-letter topic with the reason', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const { consumer, kafka } = make({ [EVENT.UNIT_BOOKED]: handler }, { maxAttempts: 3 });
    expect(await consumer.handle(msg(event()))).toBe('dead');
    expect(handler).toHaveBeenCalledTimes(3);
    const [dead] = kafka.messages(DLQ_TOPIC);
    expect(dead.headers).toMatchObject({
      'failed-service': 'sales',
      'source-topic': 'estateops.unit.booked',
      reason: 'boom',
    });
  });
  it('dead-letters unreadable and invalid messages, ignores unknown types and unhandled events', async () => {
    const { consumer, kafka } = make({ [EVENT.UNIT_BOOKED]: vi.fn() });
    expect(await consumer.handle(msg('not json'))).toBe('dead');
    expect(await consumer.handle(msg({ ...event(), data: { nope: 1 } }))).toBe('dead');
    expect(kafka.messages(DLQ_TOPIC)).toHaveLength(2);
    expect(await consumer.handle(msg({ ...event(), type: 'something.new' }))).toBe('ignored');
    expect(
      await consumer.handle(
        msg(event({ type: EVENT.BOOKING_FULLY_PAID, data: { booking_id: id(2) } })),
      ),
    ).toBe('ignored');
  });
  it('subscribes to its topics and runs', async () => {
    const consumer = { connect: vi.fn(), subscribe: vi.fn(), run: vi.fn(), disconnect: vi.fn() };
    const kafka = createInMemoryKafka();
    const c = createKafkaConsumer({
      service: 'sales',
      consumer,
      producer: kafka.producer,
      handlers: { [EVENT.UNIT_BOOKED]: vi.fn() },
      logger,
    });
    await c.start();
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: 'estateops.unit.booked',
      fromBeginning: true,
    });
    expect(consumer.run).toHaveBeenCalledWith({ eachMessage: c.handle });
    await c.stop();
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
