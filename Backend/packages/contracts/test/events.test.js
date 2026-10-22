import { describe, expect, it } from 'vitest';
import { EVENT, EVENT_SCHEMAS, buildEvent, parseEvent } from '../src/index.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT = uuid(1);

const SAMPLES = {
  [EVENT.TENANT_UPSERTED]: {
    slug: 'pk',
    name: 'Zameen',
    currency: 'PKR',
    locale: 'en-PK',
    time_zone: 'Asia/Karachi',
    area_unit: 'marla',
  },
  [EVENT.PROJECT_UPSERTED]: { project_id: uuid(2), name: 'Gulberg', kind: 'plot_society' },
  [EVENT.UNIT_UPSERTED]: {
    unit_id: uuid(3),
    project_id: uuid(2),
    project_name: 'Gulberg',
    unit_no: 'A-01',
    kind: 'plot',
    status: 'available',
    list_price: 1000,
    currency: 'PKR',
  },
  [EVENT.CUSTOMER_UPSERTED]: {
    customer_id: uuid(4),
    full_name: 'Ali',
    phone: null,
    email: 'a@x.test',
  },
  [EVENT.BOOKING_REQUESTED]: { booking_id: uuid(5), unit_id: uuid(3), customer_id: uuid(4) },
  [EVENT.UNIT_BOOKED]: { booking_id: uuid(5), unit_id: uuid(3) },
  [EVENT.UNIT_BOOKING_REJECTED]: { booking_id: uuid(5), unit_id: uuid(3), reason: 'taken' },
  [EVENT.BOOKING_CONFIRMED]: {
    booking_id: uuid(5),
    unit: {
      id: uuid(3),
      unit_no: 'A-01',
      kind: 'plot',
      project_id: uuid(2),
      project_name: 'Gulberg',
    },
    customer: { id: uuid(4), full_name: 'Ali', phone: null, email: null },
    plan: { name: '20% + 12', down_pct: 20, installment_count: 12 },
    total_price: 1000,
    currency: 'PKR',
    booked_at: '2026-10-21',
  },
  [EVENT.SCHEDULE_CREATED]: { booking_id: uuid(5), invoices: 13 },
  [EVENT.BOOKING_SUMMARY_CHANGED]: {
    booking_id: uuid(5),
    customer_id: uuid(4),
    seq: 1,
    unit_no: 'A-01',
    total_price: 1000,
    currency: 'PKR',
    installments_total: 13,
    installments_paid: 1,
    installments_due: 0,
    installments_overdue: 0,
    installments_upcoming: 12,
    received_amount: 200,
    pending_amount: 800,
    overdue_amount: 0,
    fine_amount: 0,
    next_due_date: '2026-11-21',
    escalated: false,
  },
  [EVENT.BOOKING_FULLY_PAID]: { booking_id: uuid(5) },
  [EVENT.BOOKING_COMPLETED]: { booking_id: uuid(5), unit_id: uuid(3) },
  [EVENT.BOOKING_CANCELLED]: { booking_id: uuid(5), unit_id: uuid(3), customer_id: uuid(4) },
  [EVENT.PAYMENT_RECORDED]: {
    payment_id: uuid(6),
    installment_id: uuid(7),
    booking_id: uuid(5),
    amount: 100,
    source: 'manual',
  },
  [EVENT.FINE_RATE_CHANGED]: { scope: 'default', scope_id: null, unit_kind: 'shop' },
  [EVENT.CONTRACT_STATUS_CHANGED]: { contract_id: uuid(8), booking_id: uuid(5), status: 'signed' },
};

describe('event contracts', () => {
  it('has a sample and a schema for every event name', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.values(EVENT).sort());
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(Object.values(EVENT).sort());
  });

  it.each(Object.entries(SAMPLES))('%s builds an envelope that parses back', (type, data) => {
    const event = buildEvent({ type, tenantId: TENANT, producer: 'test', data });
    expect(event).toMatchObject({ type, tenant_id: TENANT, producer: 'test', version: 1 });
    const parsed = parseEvent(JSON.parse(JSON.stringify(event)));
    expect(parsed.ok).toBe(true);
    expect(parsed.event.data).toEqual(data);
  });

  it('refuses a payload that does not match, and reports unknown types', () => {
    expect(() =>
      buildEvent({
        type: EVENT.UNIT_BOOKED,
        tenantId: TENANT,
        producer: 'test',
        data: { booking_id: 'nope' },
      }),
    ).toThrow();
    expect(() =>
      buildEvent({ type: 'nope', tenantId: TENANT, producer: 'test', data: {} }),
    ).toThrow(/Unknown event/);
    const unknown = parseEvent({
      ...buildEvent({
        type: EVENT.UNIT_BOOKED,
        tenantId: TENANT,
        producer: 'p',
        data: SAMPLES[EVENT.UNIT_BOOKED],
      }),
      type: 'future.event',
    });
    expect(unknown).toMatchObject({ ok: false, unknown: true });
    expect(parseEvent({ nonsense: true }).ok).toBe(false);
  });

  it('keeps money as integers in summaries', () => {
    const bad = { ...SAMPLES[EVENT.BOOKING_SUMMARY_CHANGED], received_amount: 1.5 };
    expect(() =>
      buildEvent({
        type: EVENT.BOOKING_SUMMARY_CHANGED,
        tenantId: TENANT,
        producer: 'p',
        data: bad,
      }),
    ).toThrow();
  });
});

describe('event routes', () => {
  it('routes every event, to known services, from its producer', async () => {
    const { EVENT_ROUTES, SERVICES, consumersOf } = await import('../src/index.js');
    expect(Object.keys(EVENT_ROUTES).sort()).toEqual(Object.values(EVENT).sort());
    for (const [type, route] of Object.entries(EVENT_ROUTES)) {
      expect(SERVICES, `${type} producer`).toContain(route.producer);
      for (const consumer of route.consumers)
        expect(SERVICES, `${type} consumer`).toContain(consumer);
    }
    expect(consumersOf('booking.confirmed')).toEqual(['billing', 'contract']);
    expect(consumersOf('nope')).toEqual([]);
  });

  it('only fine_rate.changed is consumed by its own producer', async () => {
    const { EVENT_ROUTES } = await import('../src/index.js');
    const selfRouted = Object.entries(EVENT_ROUTES)
      .filter(([, r]) => r.consumers.includes(r.producer))
      .map(([type]) => type);
    expect(selfRouted).toEqual(['fine_rate.changed']);
  });
});
