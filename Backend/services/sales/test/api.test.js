import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import {
  TEST_TENANT_A,
  TEST_TENANT_B,
  deliverEvent,
  eventsOfType,
} from '@estateops/platform/testing';
import { CUSTOMER_REF, UNIT_REF, buildSalesTest, uuid } from './fakes.js';

const BASE = '/api/v1/admin';
const BOOKING_KEYS = [
  'allowed_actions',
  'booked_at',
  'buyer_email',
  'buyer_name',
  'buyer_phone',
  'created_at',
  'created_by',
  'currency',
  'customer_id',
  'escalated',
  'fine_amount',
  'id',
  'installments_due',
  'installments_overdue',
  'installments_paid',
  'installments_total',
  'installments_upcoming',
  'next_due_date',
  'overdue_amount',
  'pending_amount',
  'plan_name',
  'project_id',
  'project_name',
  'received_amount',
  'status',
  'tenant_id',
  'total_price',
  'unit_id',
  'unit_kind',
  'unit_no',
  'updated_at',
];

describe('sales API', () => {
  let t;
  let manager;
  const get = (path, h = manager) => request(t.app).get(`${BASE}${path}`).set(h);
  const post = (path, body, h = manager) => request(t.app).post(`${BASE}${path}`).set(h).send(body);
  const patch = (path, body, h = manager) =>
    request(t.app).patch(`${BASE}${path}`).set(h).send(body);
  const del = (path, h = manager) => request(t.app).delete(`${BASE}${path}`).set(h);
  const body = (over = {}) => ({
    unit_id: UNIT_REF.unitId,
    customer_id: CUSTOMER_REF.customerId,
    plan_id: t.plan.id,
    ...over,
  });
  const ev = (type, data, tenantId = TEST_TENANT_A) =>
    buildEvent({ type, tenantId, producer: 'x', data });

  beforeEach(async () => {
    t = await buildSalesTest();
    manager = await t.auth.bearer({ role: 'sales_manager' });
  });

  describe('payment plans', () => {
    it('creates, lists, reads, edits and deletes', async () => {
      const created = await post('/payment-plans', {
        name: '25% down + 24 monthly',
        down_pct: 25,
        installment_count: 24,
      });
      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        tenant_id: TEST_TENANT_A,
        name: '25% down + 24 monthly',
        down_pct: 25,
        installment_count: 24,
        allowed_actions: ['update', 'delete'],
      });
      const list = await get('/payment-plans');
      expect(list.body.data.map((p) => p.name)).toEqual([
        '20% down + 12 monthly',
        '25% down + 24 monthly',
      ]);
      expect(list.body.next_cursor).toBeNull();
      expect(
        (await patch(`/payment-plans/${created.body.id}`, { installment_count: 36 })).body
          .installment_count,
      ).toBe(36);
      expect((await del(`/payment-plans/${created.body.id}`)).status).toBe(204);
      expect((await get(`/payment-plans/${created.body.id}`)).status).toBe(404);
    });
    it('answers 422 with fields, 409 for a duplicate and for a plan in use', async () => {
      const bad = await post('/payment-plans', { name: '', down_pct: 150, installment_count: 0 });
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d) => d.field)).toEqual([
        'name',
        'down_pct',
        'installment_count',
      ]);
      expect(
        (
          await post('/payment-plans', {
            name: '20% down + 12 monthly',
            down_pct: 1,
            installment_count: 1,
          })
        ).body.code,
      ).toBe('PLAN_NAME_TAKEN');
      await post('/bookings', body());
      expect((await del(`/payment-plans/${t.plan.id}`)).body.code).toBe('PLAN_IN_USE');
      expect((await patch(`/payment-plans/${t.plan.id}`, { tenant_id: 'x' })).status).toBe(422);
    });
    it('is visible to a support agent without actions, and closed to the marketing team', async () => {
      const support = await t.auth.bearer({ role: 'support' });
      expect((await get('/payment-plans', support)).body.data[0].allowed_actions).toEqual([]);
      expect(
        (await post('/payment-plans', { name: 'x', down_pct: 1, installment_count: 1 }, support))
          .status,
      ).toBe(403);
      expect((await get('/payment-plans', await t.auth.bearer({ role: 'marketing' }))).status).toBe(
        403,
      );
    });
  });

  describe('bookings', () => {
    it('creates a booking and returns exactly the shape the UI parses', async () => {
      const res = await post('/bookings', body());
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(BOOKING_KEYS);
      expect(res.body).toMatchObject({
        status: 'requested',
        unit_no: 'A-01',
        unit_kind: 'plot',
        project_name: 'Gulberg Greens',
        buyer_name: 'Ali Raza',
        plan_name: '20% down + 12 monthly',
        total_price: 1_000_000_00,
        currency: 'PKR',
        booked_at: '2026-10-21',
        installments_total: 0,
        received_amount: 0,
        escalated: false,
        next_due_date: null,
        allowed_actions: ['cancel'],
        tenant_id: TEST_TENANT_A,
      });
      expect(eventsOfType(t.events, 'booking.requested')).toHaveLength(1);
    });
    it('answers 422, 404 and 409 with the documented codes', async () => {
      expect((await post('/bookings', {})).status).toBe(422);
      expect((await post('/bookings', body({ booked_at: '2031-01-01' }))).body.details).toEqual([
        { field: 'booked_at', message: 'The booking date cannot be in the future' },
      ]);
      expect((await post('/bookings', body({ unit_id: uuid(999) }))).status).toBe(404);
      expect((await post('/bookings', body())).status).toBe(201);
      const again = await post('/bookings', body());
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('UNIT_ALREADY_BOOKED');
      expect((await get(`/bookings/${uuid(999)}`)).status).toBe(404);
    });
    it('lists with filters, sorting and a cursor, and reads one', async () => {
      const first = (await post('/bookings', body())).body;
      t.stores.unitRefs.set(uuid(102), {
        ...UNIT_REF,
        unitId: uuid(102),
        unitNo: 'B-02',
        kind: 'shop',
      });
      await post('/bookings', body({ unit_id: uuid(102) }));
      expect((await get('/bookings')).body.data).toHaveLength(2);
      expect((await get('/bookings?kind=shop')).body.data).toHaveLength(1);
      expect(
        (await get(`/bookings?customer_id=${CUSTOMER_REF.customerId}&status=requested`)).body.data,
      ).toHaveLength(2);
      expect((await get('/bookings?sort=unit_no:desc')).body.data.map((b) => b.unit_no)).toEqual([
        'B-02',
        'A-01',
      ]);
      const page = await get('/bookings?limit=1');
      expect(page.body.next_cursor).toEqual(expect.any(String));
      expect(
        (await get(`/bookings?limit=1&cursor=${page.body.next_cursor}`)).body.data,
      ).toHaveLength(1);
      expect((await get(`/bookings/${first.id}`)).body.id).toBe(first.id);
      expect((await get('/bookings?escalated=maybe')).status).toBe(422);
      expect((await get('/bookings?sort=evil:asc')).status).toBe(422);
    });
    it('cancels a booking, hides the action afterwards, and refuses a second cancel', async () => {
      const b = (await post('/bookings', body())).body;
      const cancelled = await post(`/bookings/${b.id}/cancel`, { reason: 'Customer withdrew' });
      expect(cancelled.body).toMatchObject({ status: 'cancelled', allowed_actions: [] });
      expect((await post(`/bookings/${b.id}/cancel`, {})).body.code).toBe('INVALID_TRANSITION');
      expect((await post(`/bookings/${b.id}/cancel`, { unknown: 1 })).status).toBe(422);
      expect(eventsOfType(t.events, 'booking.cancelled')).toHaveLength(1);
    });
  });

  describe('through the event endpoint', () => {
    it('walks a booking through reserve, schedule and payment events with the money figures shown', async () => {
      const b = (await post('/bookings', body())).body;
      await deliverEvent(t.app, ev(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unit_id }));
      expect((await get(`/bookings/${b.id}`)).body.status).toBe('confirmed');
      await deliverEvent(t.app, ev(EVENT.SCHEDULE_CREATED, { booking_id: b.id, invoices: 13 }));
      await deliverEvent(
        t.app,
        ev(EVENT.BOOKING_SUMMARY_CHANGED, {
          booking_id: b.id,
          customer_id: b.customer_id,
          seq: 1,
          unit_no: 'A-01',
          total_price: b.total_price,
          currency: 'PKR',
          installments_total: 13,
          installments_paid: 1,
          installments_due: 0,
          installments_overdue: 3,
          installments_upcoming: 9,
          received_amount: 200_000_00,
          pending_amount: 800_000_00,
          overdue_amount: 60_000_00,
          fine_amount: 1_200_00,
          next_due_date: '2026-11-21',
          escalated: true,
        }),
      );
      const active = (await get(`/bookings/${b.id}`)).body;
      expect(active).toMatchObject({
        status: 'active',
        installments_total: 13,
        installments_overdue: 3,
        received_amount: 200_000_00,
        fine_amount: 1_200_00,
        next_due_date: '2026-11-21',
        escalated: true,
        allowed_actions: [],
      });
      expect((await get('/bookings?escalated=true')).body.data).toHaveLength(1);
      await deliverEvent(t.app, ev(EVENT.BOOKING_FULLY_PAID, { booking_id: b.id }));
      expect((await get(`/bookings/${b.id}`)).body.status).toBe('completed');
      expect(eventsOfType(t.events, 'booking.completed')).toHaveLength(1);
    });
    it('cancels the booking when inventory rejects it', async () => {
      const b = (await post('/bookings', body())).body;
      await deliverEvent(
        t.app,
        ev(EVENT.UNIT_BOOKING_REJECTED, {
          booking_id: b.id,
          unit_id: b.unit_id,
          reason: 'The unit is sold',
        }),
      );
      expect((await get(`/bookings/${b.id}`)).body.status).toBe('cancelled');
    });
    it('learns units and customers from their events so bookings can be made', async () => {
      const cold = await buildSalesTest();
      cold.stores.unitRefs.clear();
      cold.stores.customerRefs.clear();
      const token = await cold.auth.bearer({ role: 'sales_manager' });
      const create = () => request(cold.app).post(`${BASE}/bookings`).set(token).send(body());
      expect((await create()).status).toBe(404);
      await deliverEvent(
        cold.app,
        ev(EVENT.UNIT_UPSERTED, {
          unit_id: UNIT_REF.unitId,
          project_id: UNIT_REF.projectId,
          project_name: 'Gulberg Greens',
          unit_no: 'A-01',
          kind: 'plot',
          status: 'available',
          list_price: 1_000_000_00,
          currency: 'PKR',
        }),
      );
      await deliverEvent(
        cold.app,
        ev(EVENT.CUSTOMER_UPSERTED, {
          customer_id: CUSTOMER_REF.customerId,
          full_name: 'Ali Raza',
          phone: null,
          email: null,
        }),
      );
      const res = await create();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ buyer_phone: '', buyer_email: '' });
    });
  });

  describe('who may do what', () => {
    it('lets a sales agent sell, a support agent look, and a finance user look but not change', async () => {
      const agent = await t.auth.bearer({ role: 'sales_agent' });
      const b = (await post('/bookings', body(), agent)).body;
      expect(b.allowed_actions).toEqual(['cancel']);
      for (const role of ['support', 'finance']) {
        const h = await t.auth.bearer({ role });
        expect((await get(`/bookings/${b.id}`, h)).body.allowed_actions).toEqual([]);
        expect((await post(`/bookings/${b.id}/cancel`, {}, h)).status).toBe(403);
      }
      expect(
        (await post('/bookings', body(), await t.auth.bearer({ role: 'auditor' }))).status,
      ).toBe(403);
      expect((await get('/bookings', await t.auth.bearer({ role: 'marketing' }))).status).toBe(403);
    });
    it('needs a token and keeps tenants apart', async () => {
      expect((await request(t.app).get(`${BASE}/bookings`)).status).toBe(401);
      const b = (await post('/bookings', body())).body;
      const stranger = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
      expect((await get(`/bookings/${b.id}`, stranger)).status).toBe(404);
      expect((await get('/bookings', stranger)).body.data).toEqual([]);
      expect((await post(`/bookings/${b.id}/cancel`, {}, stranger)).status).toBe(404);
    });
    it('requires the internal token for events', async () => {
      const e = ev(EVENT.BOOKING_FULLY_PAID, { booking_id: uuid(1) });
      expect((await request(t.app).post('/internal/events').send(e)).status).toBe(401);
    });
  });
});
