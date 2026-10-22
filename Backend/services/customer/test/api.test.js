import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B, deliverEvent } from '@estateops/platform/testing';
import { buildCustomerTest } from './fakes.js';

const BASE = '/api/v1/admin';
const BODY = {
  full_name: 'Ali Raza',
  phone: '+92 300 1234567',
  email: 'ali@example.test',
  id_number: '35202-1234567-1',
  city: 'Lahore',
  preferred_language: 'en',
};
const KEYS = [
  'allowed_actions',
  'bookings_count',
  'city',
  'created_at',
  'currency',
  'email',
  'escalated_count',
  'full_name',
  'id',
  'id_number_masked',
  'overdue_amount',
  'pending_amount',
  'phone',
  'preferred_language',
  'received_amount',
  'tenant_id',
  'total_value',
  'units_summary',
  'updated_at',
];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('customer API', () => {
  let t;
  let owner;
  const get = (path, h = owner) => request(t.app).get(`${BASE}${path}`).set(h);
  const post = (path, body, h = owner) => request(t.app).post(`${BASE}${path}`).set(h).send(body);
  const patch = (path, body, h = owner) => request(t.app).patch(`${BASE}${path}`).set(h).send(body);
  beforeEach(async () => {
    t = await buildCustomerTest();
    owner = await t.auth.bearer({ role: 'owner' });
  });

  it('creates a customer in exactly the shape the UI parses, with the ID number masked', async () => {
    const res = await post('/customers', BODY);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(KEYS);
    expect(res.body).toMatchObject({
      full_name: 'Ali Raza',
      email: 'ali@example.test',
      id_number_masked: '*****-*******-1',
      currency: 'PKR',
      bookings_count: 0,
      units_summary: [],
      tenant_id: TEST_TENANT_A,
      allowed_actions: ['update', 'delete'],
    });
    expect(JSON.stringify(res.body)).not.toContain('35202-1234567');
  });
  it('lists, reads, updates and deletes', async () => {
    const created = (await post('/customers', BODY)).body;
    const list = await get('/customers');
    expect(list.body).toEqual({
      data: [expect.objectContaining({ id: created.id })],
      next_cursor: null,
    });
    expect((await get(`/customers/${created.id}`)).body.full_name).toBe('Ali Raza');
    const updated = await patch(`/customers/${created.id}`, { city: 'Karachi', phone: null });
    expect(updated.body).toMatchObject({ city: 'Karachi', phone: '' });
    expect((await request(t.app).delete(`${BASE}/customers/${created.id}`).set(owner)).status).toBe(
      204,
    );
    expect((await get(`/customers/${created.id}`)).status).toBe(404);
  });
  it('supports search, the overdue filter, sorting and cursors', async () => {
    for (const [name, email] of [
      ['Ali', 'a@x.test'],
      ['Bilal', 'b@x.test'],
      ['Chand', 'c@x.test'],
    ])
      await post('/customers', { full_name: name, email });
    expect((await get('/customers?q=bil')).body.data.map((c) => c.full_name)).toEqual(['Bilal']);
    expect((await get('/customers?has_overdue=true')).body.data).toEqual([]);
    expect((await get('/customers?sort=full_name:desc')).body.data.map((c) => c.full_name)).toEqual(
      ['Chand', 'Bilal', 'Ali'],
    );
    const first = await get('/customers?limit=2');
    expect(
      (await get(`/customers?limit=2&cursor=${first.body.next_cursor}`)).body.data,
    ).toHaveLength(1);
    expect((await get('/customers?sort=evil:asc')).status).toBe(422);
    expect((await get('/customers?has_overdue=maybe')).status).toBe(422);
  });
  it('answers 422 with field details, 409 for a duplicate email and 404 for an unknown id', async () => {
    const bad = await post('/customers', { full_name: '', email: 'nope', phone: 'abc' });
    expect(bad.status).toBe(422);
    expect(bad.body.details.map((d) => d.field)).toEqual(['full_name', 'phone', 'email']);
    await post('/customers', BODY);
    const dup = await post('/customers', { ...BODY, email: 'ALI@example.test' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    expect((await get(`/customers/${uuid(404)}`)).status).toBe(404);
    expect((await patch(`/customers/${uuid(404)}`, { city: 'x' })).status).toBe(404);
    expect((await patch('/customers/x', { bookings_count: 9 })).status).toBe(422);
  });
  it('shows a customer’s money position from billing events and refuses to delete them', async () => {
    const c = (await post('/customers', BODY)).body;
    await deliverEvent(
      t.app,
      buildEvent({
        type: EVENT.BOOKING_SUMMARY_CHANGED,
        tenantId: TEST_TENANT_A,
        producer: 'billing',
        data: {
          booking_id: uuid(1),
          customer_id: c.id,
          seq: 1,
          unit_no: 'A-01',
          total_price: 1000,
          currency: 'PKR',
          installments_total: 13,
          installments_paid: 1,
          installments_due: 0,
          installments_overdue: 3,
          installments_upcoming: 9,
          received_amount: 200,
          pending_amount: 800,
          overdue_amount: 300,
          fine_amount: 10,
          next_due_date: null,
          escalated: true,
        },
      }),
    );
    const got = (await get(`/customers/${c.id}`)).body;
    expect(got).toMatchObject({
      bookings_count: 1,
      units_summary: ['A-01'],
      total_value: 1000,
      received_amount: 200,
      pending_amount: 800,
      overdue_amount: 300,
      escalated_count: 1,
      allowed_actions: ['update'],
    });
    expect((await get('/customers?has_overdue=true')).body.data).toHaveLength(1);
    const del = await request(t.app).delete(`${BASE}/customers/${c.id}`).set(owner);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('CUSTOMER_HAS_BOOKINGS');
  });
  it('lets a sales agent manage customers, a support agent look, a dealer manager see nothing', async () => {
    const agent = await t.auth.bearer({ role: 'sales_agent' });
    const c = (await post('/customers', BODY, agent)).body;
    expect(c.allowed_actions).toEqual(['update', 'delete']);
    const support = await t.auth.bearer({ role: 'support' });
    expect((await get(`/customers/${c.id}`, support)).body.allowed_actions).toEqual([]);
    expect((await post('/customers', { ...BODY, email: 'z@x.test' }, support)).status).toBe(403);
    expect((await patch(`/customers/${c.id}`, { city: 'x' }, support)).status).toBe(403);
    const dealer = await t.auth.bearer({ role: 'dealer_manager' });
    expect((await get('/customers', dealer)).status).toBe(403);
  });
  it('needs a token and keeps tenants apart', async () => {
    expect((await request(t.app).get(`${BASE}/customers`)).status).toBe(401);
    const c = (await post('/customers', BODY)).body;
    const stranger = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
    expect((await get(`/customers/${c.id}`, stranger)).status).toBe(404);
    expect((await get('/customers', stranger)).body.data).toEqual([]);
    expect((await patch(`/customers/${c.id}`, { city: 'x' }, stranger)).status).toBe(404);
  });
  it('requires the internal token for events and ignores ones it does not consume', async () => {
    const event = buildEvent({
      type: EVENT.BOOKING_FULLY_PAID,
      tenantId: TEST_TENANT_A,
      producer: 'billing',
      data: { booking_id: uuid(1) },
    });
    expect((await request(t.app).post('/internal/events').send(event)).status).toBe(401);
    expect((await deliverEvent(t.app, event)).body).toEqual({ ignored: true });
  });
});
