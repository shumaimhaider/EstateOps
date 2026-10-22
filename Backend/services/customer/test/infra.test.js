import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { newId } from '@estateops/kernel';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createTypeormUow,
  silentLogger,
} from '@estateops/platform';
import {
  TEST_TENANT_A,
  TEST_TENANT_B,
  createTestAuth,
  createTestDatabase,
  deliverEvent,
  postgresAvailable,
} from '@estateops/platform/testing';
import { ApplyBookingCancelled } from '../src/customers/application/ApplyBookingCancelled.js';
import { ApplyBookingSummary } from '../src/customers/application/ApplyBookingSummary.js';
import { createCustomer } from '../src/customers/domain/customer.js';
import { composeCustomer } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { CUSTOMER, clock } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[customer db tests] no PostgreSQL reachable: skipping\n');

describe.skipIf(!available)('customer on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  const run = (work) => uow.run(work);
  const mk = async (over = {}, tenantId = TEST_TENANT_A) => {
    const c = createCustomer({ tenantId, ...CUSTOMER, email: `${newId()}@x.test`, ...over });
    await run((r) => r.customers.insert(c));
    return c;
  };
  const summaryEvent = (c, bookingId, seq, over = {}) =>
    buildEvent({
      type: EVENT.BOOKING_SUMMARY_CHANGED,
      tenantId: c.tenantId,
      producer: 'billing',
      data: {
        booking_id: bookingId,
        customer_id: c.id,
        seq,
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
        next_due_date: null,
        escalated: false,
        ...over,
      },
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 8 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'customer', buildRepos });
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  it('keeps an email unique per tenant (any case), lets customers without email coexist', async () => {
    await mk({ email: 'dup@x.test' });
    await expect(mk({ email: 'DUP@x.test' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(mk({ email: 'dup@x.test' }, TEST_TENANT_B)).resolves.toBeTruthy();
    await mk({ email: null });
    await expect(mk({ email: null })).resolves.toBeTruthy();
  });

  it('round-trips a customer, with the version guarding concurrent edits', async () => {
    const c = await mk({ fullName: 'Zoya Khan', city: 'Dubai', idNumber: '784-1990-1234567-1' });
    const found = await run((r) => r.customers.findById(c.tenantId, c.id));
    expect(found).toMatchObject({
      fullName: 'Zoya Khan',
      city: 'Dubai',
      idNumber: '784-1990-1234567-1',
      bookingsCount: 0,
      totalValue: 0,
      unitsSummary: [],
      version: 1,
    });
    const saved = await run((r) => r.customers.update({ ...found, city: 'Abu Dhabi' }));
    expect(saved.version).toBe(2);
    await expect(
      run((r) => r.customers.update({ ...found, city: 'Sharjah' })),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await run((r) => r.customers.findById(TEST_TENANT_B, c.id))).toBeNull();
  });

  it('computes totals as sums over live bookings, in one statement, with bigint money', async () => {
    const c = await mk();
    const apply = (e) => new ApplyBookingSummary({ uow }).execute(e);
    await apply(
      summaryEvent(c, newId(), 1, {
        unit_no: 'B-02',
        total_price: 9_000_000_000_000,
        received_amount: 1_000_000_000_000,
        pending_amount: 8_000_000_000_000,
      }),
    );
    await apply(
      summaryEvent(c, newId(), 1, {
        unit_no: 'A-01',
        total_price: 500,
        received_amount: 100,
        pending_amount: 400,
        overdue_amount: 50,
        escalated: true,
      }),
    );
    const found = await run((r) => r.customers.findById(c.tenantId, c.id));
    expect(found).toMatchObject({
      bookingsCount: 2,
      totalValue: 9_000_000_000_500,
      receivedAmount: 1_000_000_000_100,
      pendingAmount: 8_000_000_000_400,
      overdueAmount: 50,
      escalatedCount: 1,
      unitsSummary: ['A-01', 'B-02'],
    });
  });

  it('applies only a newer summary, and a cancelled booking never counts again', async () => {
    const c = await mk();
    const id = newId();
    const apply = (e) => new ApplyBookingSummary({ uow }).execute(e);
    await apply(summaryEvent(c, id, 5, { received_amount: 900, pending_amount: 100 }));
    await apply(summaryEvent(c, id, 3, { received_amount: 1, pending_amount: 999 }));
    expect((await run((r) => r.customers.findById(c.tenantId, c.id))).receivedAmount).toBe(900);
    await new ApplyBookingCancelled({ uow }).execute(
      buildEvent({
        type: EVENT.BOOKING_CANCELLED,
        tenantId: c.tenantId,
        producer: 'sales',
        data: { booking_id: id, unit_id: newId(), customer_id: c.id },
      }),
    );
    await apply(summaryEvent(c, id, 9));
    expect(await run((r) => r.customers.findById(c.tenantId, c.id))).toMatchObject({
      bookingsCount: 0,
      totalValue: 0,
      receivedAmount: 0,
      unitsSummary: [],
    });
    expect(await run((r) => r.customers.hasSummaries(c.tenantId, c.id))).toBe(true);
  });

  it('refuses a summary for a customer that was never there, without failing the event', async () => {
    const ghost = createCustomer({ tenantId: TEST_TENANT_A, ...CUSTOMER });
    const result = await new ApplyBookingSummary({ uow }).execute(summaryEvent(ghost, newId(), 1));
    expect(result.duplicate).toBe(false);
    expect(
      await ds.query('SELECT 1 FROM customer.booking_summary WHERE customer_id = $1', [ghost.id]),
    ).toHaveLength(0);
  });

  it('prevents deleting a customer that has bookings at the database level too', async () => {
    const c = await mk();
    await new ApplyBookingSummary({ uow }).execute(summaryEvent(c, newId(), 1));
    await expect(
      ds.query('DELETE FROM customer.customer WHERE id = $1', [c.id]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('lists with search (name, phone, email, units), overdue filter, numeric sorts and paging', async () => {
    const tenantId = newId();
    const people = [];
    for (let i = 0; i < 9; i += 1)
      people.push(
        await mk(
          { fullName: `Buyer ${String(i).padStart(2, '0')}`, phone: `+92 300 000000${i}` },
          tenantId,
        ),
      );
    for (const [i, c] of people.entries()) {
      await new ApplyBookingSummary({ uow }).execute(
        summaryEvent(c, newId(), 1, {
          unit_no: `U-${i}`,
          total_price: (i % 3) * 1000 + 1000,
          received_amount: 0,
          pending_amount: 1,
          overdue_amount: i === 4 ? 70 : 0,
        }),
      );
    }
    const list = (f) => run((r) => r.customers.list(tenantId, f));
    expect((await list({ q: 'buyer 03' })).items.map((c) => c.fullName)).toEqual(['Buyer 03']);
    expect((await list({ q: '0000007' })).items.map((c) => c.fullName)).toEqual(['Buyer 07']);
    expect((await list({ q: 'u-5' })).items.map((c) => c.fullName)).toEqual(['Buyer 05']);
    expect((await list({ hasOverdue: true })).items.map((c) => c.fullName)).toEqual(['Buyer 04']);
    expect((await list({ q: '%' })).items).toEqual([]);
    for (const sort of [
      'total_value:asc',
      'total_value:desc',
      'full_name:desc',
      'overdue_amount:desc',
      'bookings_count:asc',
    ]) {
      const rows = [];
      let cursor;
      do {
        const page = await list({ sort, cursor, limit: 4 });
        rows.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(rows, sort).toHaveLength(9);
      expect(new Set(rows.map((c) => c.id)).size).toBe(9);
    }
    const byValue = (await list({ sort: 'total_value:desc', limit: 200 })).items.map(
      (c) => c.totalValue,
    );
    expect(byValue).toEqual([...byValue].sort((a, b) => b - a));
  });

  it('serves the whole service on the real stack, with currency learned from the tenant event', async () => {
    const auth = await createTestAuth();
    const app = composeCustomer({
      uow,
      clock,
      verifier: auth.verifier,
      logger: silentLogger,
      internalToken: 'test-internal-token',
      idempotencyStore: createIdempotencyStore(ds, { schema: 'customer' }),
      readyCheck: () => ds.query('SELECT 1'),
    });
    const tenantId = newId();
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.TENANT_UPSERTED,
        tenantId,
        producer: 'identity',
        data: {
          slug: 'aa',
          name: 'A',
          currency: 'AED',
          locale: 'en-AE',
          time_zone: 'Asia/Dubai',
          area_unit: 'sq_ft',
        },
      }),
    );
    const owner = await auth.bearer({ role: 'owner', tenantId });
    const created = await request(app)
      .post('/api/v1/admin/customers')
      .set(owner)
      .send({ full_name: 'Omar', email: 'omar@x.test', id_number: '784-1990-1234567-1' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ currency: 'AED', id_number_masked: '***-****-*******-1' });
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.BOOKING_SUMMARY_CHANGED,
        tenantId,
        producer: 'billing',
        data: {
          booking_id: newId(),
          customer_id: created.body.id,
          seq: 1,
          unit_no: 'M-101',
          total_price: 2000,
          currency: 'AED',
          installments_total: 13,
          installments_paid: 1,
          installments_due: 0,
          installments_overdue: 0,
          installments_upcoming: 12,
          received_amount: 300,
          pending_amount: 1700,
          overdue_amount: 0,
          fine_amount: 0,
          next_due_date: null,
          escalated: false,
        },
      }),
    );
    expect(
      (await request(app).get(`/api/v1/admin/customers/${created.body.id}`).set(owner)).body,
    ).toMatchObject({
      bookings_count: 1,
      units_summary: ['M-101'],
      total_value: 2000,
      allowed_actions: ['update'],
    });
    const audit = await ds.query(`SELECT action FROM customer.audit_log WHERE tenant_id = $1`, [
      tenantId,
    ]);
    expect(audit.map((a) => a.action)).toEqual(['customer.create']);
    const outbox = await ds.query(`SELECT type FROM customer.outbox WHERE tenant_id = $1`, [
      tenantId,
    ]);
    expect(outbox.map((o) => o.type)).toEqual(['customer.upserted']);
  });
});
