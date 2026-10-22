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
  createTestAuth,
  createTestDatabase,
  deliverEvent,
  postgresAvailable,
} from '@estateops/platform/testing';
import { CancelBooking } from '../src/bookings/application/CancelBooking.js';
import { CreateBooking } from '../src/bookings/application/CreateBooking.js';
import { FollowSaga } from '../src/bookings/application/FollowSaga.js';
import { createBooking } from '../src/bookings/domain/booking.js';
import { createPlan } from '../src/plans/domain/plan.js';
import { composeSales } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { CUSTOMER_REF, UNIT_REF, clock } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[sales db tests] no PostgreSQL reachable: skipping\n');

describe.skipIf(!available)('sales on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  const run = (work) => uow.run(work);
  const tenantId = TEST_TENANT_A;

  const mkPlan = async (over = {}) => {
    const p = createPlan({
      tenantId,
      name: `Plan ${newId().slice(0, 6)}`,
      downPct: 20,
      installmentCount: 12,
      ...over,
    });
    await run((r) => r.plans.insert(p));
    return p;
  };
  const mkUnitRef = (over = {}) => {
    const u = { ...UNIT_REF, unitId: newId(), unitNo: `U-${newId().slice(0, 6)}`, ...over };
    return run((r) => r.unitRefs.upsert(u, '2026-10-20T00:00:00.000Z')).then(() => u);
  };
  const mkCustomerRef = (over = {}) => {
    const c = { ...CUSTOMER_REF, customerId: newId(), ...over };
    return run((r) => r.customerRefs.upsert(c, '2026-10-20T00:00:00.000Z')).then(() => c);
  };
  const mkBooking = async (over = {}) => {
    const plan = over.plan ?? (await mkPlan());
    const unit = over.unit ?? (await mkUnitRef());
    const customer = over.customer ?? (await mkCustomerRef());
    const b = createBooking({
      tenantId,
      unit,
      customer,
      plan,
      bookedAt: '2026-10-01',
      today: '2026-10-21',
      createdBy: null,
    });
    await run((r) => r.bookings.insert(b));
    return b;
  };
  const sales = {
    tenantId,
    userId: newId(),
    name: 'S',
    role: 'sales_manager',
    permissions: ['sales.manage', 'sales.view'],
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 10 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'sales', buildRepos });
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  describe('constraints the database enforces', () => {
    it('keeps plan names unique per tenant and its numbers in range', async () => {
      const p = await mkPlan({ name: 'Unique Plan' });
      await expect(
        run((r) => r.plans.insert({ ...p, id: newId(), name: 'UNIQUE plan' })),
      ).rejects.toMatchObject({ code: 'PLAN_NAME_TAKEN' });
      await expect(
        ds.query('UPDATE sales.payment_plan SET down_pct = 101 WHERE id = $1', [p.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'plan_down_pct_chk' } });
      await expect(
        ds.query('UPDATE sales.payment_plan SET installment_count = 0 WHERE id = $1', [p.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'plan_count_chk' } });
    });

    it('lets a unit have only one live booking, but another after a cancellation', async () => {
      const unit = await mkUnitRef();
      const first = await mkBooking({ unit });
      await expect(mkBooking({ unit })).rejects.toMatchObject({ code: 'UNIT_ALREADY_BOOKED' });
      await run((r) => r.bookings.update({ ...first, status: 'cancelled' }));
      await expect(mkBooking({ unit })).resolves.toBeTruthy();
      expect(await run((r) => r.bookings.hasLiveBookingForUnit(unit.unitId))).toBe(true);
    });

    it('rejects a bad status, a zero price, and a plan that is in use cannot be removed', async () => {
      const b = await mkBooking();
      await expect(
        ds.query(`UPDATE sales.booking SET status = 'lost' WHERE id = $1`, [b.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'booking_status_chk' } });
      await expect(
        ds.query('UPDATE sales.booking SET total_price = 0 WHERE id = $1', [b.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'booking_price_chk' } });
      await expect(
        ds.query('DELETE FROM sales.payment_plan WHERE id = $1', [b.planId]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      expect(await run((r) => r.plans.inUse(tenantId, b.planId))).toBe(true);
    });
  });

  describe('repositories', () => {
    it('round-trips a booking, keeping dates as plain strings and money as numbers', async () => {
      const b = await mkBooking();
      const found = await run((r) => r.bookings.findById(tenantId, b.id));
      expect(found).toMatchObject({
        bookedAt: '2026-10-01',
        totalPrice: 1_000_000_00,
        currency: 'PKR',
        status: 'requested',
        nextDueDate: null,
        receivedAmount: 0,
        version: 1,
      });
      expect(found.createdAt).toBeInstanceOf(Date);
    });

    it('guards updates with the version', async () => {
      const b = await mkBooking();
      const saved = await run((r) => r.bookings.update({ ...b, status: 'confirmed' }));
      expect(saved.version).toBe(2);
      await expect(
        run((r) => r.bookings.update({ ...b, status: 'cancelled' })),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    it('sorts and pages by date, money and the nullable next due date', async () => {
      const customer = await mkCustomerRef();
      const plan = await mkPlan();
      for (let i = 0; i < 9; i += 1) {
        const b = await mkBooking({ customer, plan });
        await run((r) =>
          r.bookings.update({
            ...b,
            receivedAmount: (i % 4) * 100,
            nextDueDate: i % 3 === 0 ? null : `2026-1${i % 3}-${10 + i}`,
          }),
        );
      }
      for (const sort of [
        'booked_at:desc',
        'received_amount:asc',
        'received_amount:desc',
        'next_due_date:asc',
        'next_due_date:desc',
        'unit_no:asc',
      ]) {
        const rows = [];
        let cursor;
        do {
          const page = await run((r) =>
            r.bookings.list(tenantId, { customerId: customer.customerId, sort, cursor, limit: 4 }),
          );
          rows.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(rows, sort).toHaveLength(9);
        expect(new Set(rows.map((x) => x.id)).size).toBe(9);
      }
      const byMoney = (
        await run((r) =>
          r.bookings.list(tenantId, {
            customerId: customer.customerId,
            sort: 'received_amount:desc',
            limit: 50,
          }),
        )
      ).items.map((b) => b.receivedAmount);
      expect(byMoney).toEqual([...byMoney].sort((a, b) => b - a));
    });

    it('filters by status, kind, escalation and text, within the tenant', async () => {
      const unit = await mkUnitRef({ kind: 'shop', unitNo: 'SHOP-77', projectName: 'Mall Plaza' });
      const b = await mkBooking({ unit });
      await run((r) => r.bookings.update({ ...b, escalated: true, status: 'active' }));
      const list = (f) =>
        run((r) => r.bookings.list(tenantId, f)).then((p) => p.items.map((x) => x.id));
      expect(
        await list({ kind: 'shop', status: 'active', escalated: true, q: 'mall plaza' }),
      ).toContain(b.id);
      expect(await list({ q: 'shop-77' })).toEqual([b.id]);
      expect(await list({ q: '%' })).toEqual([]);
      expect(await list({ unitId: unit.unitId })).toEqual([b.id]);
      expect(await run((r) => r.bookings.list(newId(), {}))).toMatchObject({ items: [] });
    });

    it('refreshes snapshot names on a customer or unit change, and keeps the newest ref', async () => {
      const b = await mkBooking();
      await run((r) =>
        r.bookings.refreshBuyer(tenantId, b.customerId, {
          name: 'New Name',
          phone: '+1',
          email: 'n@x.test',
        }),
      );
      await run((r) =>
        r.bookings.refreshUnitNames(tenantId, b.unitId, {
          unitNo: 'Z-9',
          projectName: 'New Project',
        }),
      );
      expect(await run((r) => r.bookings.findById(tenantId, b.id))).toMatchObject({
        buyerName: 'New Name',
        buyerPhone: '+1',
        unitNo: 'Z-9',
        projectName: 'New Project',
      });
      const unit = await mkUnitRef();
      expect(
        await run((r) =>
          r.unitRefs.upsert({ ...unit, status: 'sold' }, '2026-10-19T00:00:00.000Z'),
        ),
      ).toBe(false);
      expect((await run((r) => r.unitRefs.get(tenantId, unit.unitId))).status).toBe('available');
      expect(
        await run((r) =>
          r.unitRefs.upsert({ ...unit, status: 'sold' }, '2026-10-21T00:00:00.000Z'),
        ),
      ).toBe(true);
    });
  });

  describe('concurrency', () => {
    it('lets only one of several simultaneous requests book the same unit', async () => {
      const plan = await mkPlan();
      const unit = await mkUnitRef();
      const customer = await mkCustomerRef();
      const create = new CreateBooking({ uow, clock });
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          create.execute({
            actor: sales,
            unitId: unit.unitId,
            customerId: customer.customerId,
            planId: plan.id,
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((x) => x.status === 'rejected'))
        expect(r.reason).toMatchObject({ code: 'UNIT_ALREADY_BOOKED' });
      const live = await ds.query(
        `SELECT count(*)::int AS n FROM sales.booking WHERE unit_id = $1 AND status <> 'cancelled'`,
        [unit.unitId],
      );
      expect(live[0].n).toBe(1);
    });

    it('serialises a cancel racing a confirmation: the unit is always freed in the end', async () => {
      const b = await mkBooking();
      const confirm = new FollowSaga({ uow, clock, step: 'confirmed' });
      const cancel = new CancelBooking({ uow, clock });
      const booked = buildEvent({
        type: EVENT.UNIT_BOOKED,
        tenantId,
        producer: 'inventory',
        data: { booking_id: b.id, unit_id: b.unitId },
      });
      await Promise.all([confirm.execute(booked), cancel.execute({ actor: sales, id: b.id })]);
      const final = await run((r) => r.bookings.findById(tenantId, b.id));
      expect(final.status).toBe('cancelled');
      const cancelEvents = await ds.query(
        `SELECT 1 FROM sales.outbox WHERE type = 'booking.cancelled' AND payload->'data'->>'booking_id' = $1`,
        [b.id],
      );
      expect(cancelEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('serves the whole service on the real stack, committing events and audit with the data', async () => {
    const auth = await createTestAuth();
    const app = composeSales({
      uow,
      clock,
      verifier: auth.verifier,
      logger: silentLogger,
      internalToken: 'test-internal-token',
      idempotencyStore: createIdempotencyStore(ds, { schema: 'sales' }),
      readyCheck: () => ds.query('SELECT 1'),
    });
    const tid = newId();
    const owner = await auth.bearer({ role: 'owner', tenantId: tid });
    const unitId = newId();
    const customerId = newId();
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.UNIT_UPSERTED,
        tenantId: tid,
        producer: 'inventory',
        data: {
          unit_id: unitId,
          project_id: newId(),
          project_name: 'P',
          unit_no: 'A-1',
          kind: 'flat',
          status: 'available',
          list_price: 5_000_00,
          currency: 'PKR',
        },
      }),
    );
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.CUSTOMER_UPSERTED,
        tenantId: tid,
        producer: 'customer',
        data: { customer_id: customerId, full_name: 'Zoya', phone: null, email: null },
      }),
    );
    const plan = await request(app)
      .post('/api/v1/admin/payment-plans')
      .set(owner)
      .send({ name: '10% + 6', down_pct: 10, installment_count: 6 });
    expect(plan.status).toBe(201);
    const created = await request(app)
      .post('/api/v1/admin/bookings')
      .set(owner)
      .send({ unit_id: unitId, customer_id: customerId, plan_id: plan.body.id });
    expect(created.status).toBe(201);
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.UNIT_BOOKED,
        tenantId: tid,
        producer: 'inventory',
        data: { booking_id: created.body.id, unit_id: unitId },
      }),
    );
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.SCHEDULE_CREATED,
        tenantId: tid,
        producer: 'billing',
        data: { booking_id: created.body.id, invoices: 7 },
      }),
    );
    expect(
      (await request(app).get(`/api/v1/admin/bookings/${created.body.id}`).set(owner)).body.status,
    ).toBe('active');
    const types = (
      await ds.query(`SELECT type FROM sales.outbox WHERE tenant_id = $1 ORDER BY created_at`, [
        tid,
      ])
    ).map((r) => r.type);
    expect(types).toEqual(['booking.requested', 'booking.confirmed']);
    const audit = (
      await ds.query(
        `SELECT action FROM sales.audit_log WHERE tenant_id = $1 ORDER BY created_at`,
        [tid],
      )
    ).map((r) => r.action);
    expect(audit).toEqual(['plan.create', 'booking.create', 'booking.confirm', 'booking.activate']);
    expect((await request(app).get('/health/ready')).status).toBe(200);
  });
});
