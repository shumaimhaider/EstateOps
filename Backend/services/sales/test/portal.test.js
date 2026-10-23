import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_TENANT_B } from '@estateops/platform/testing';
import { CreateBooking } from '../src/bookings/application/CreateBooking.js';
import { CUSTOMER_REF, UNIT_REF, buildSalesTest, uuid } from './fakes.js';

const PORTAL = '/api/v1/portal';
const OTHER = uuid(302);

describe('portal properties', () => {
  let t;
  let mine;
  let theirs;
  const get = (path, headers) => request(t.app).get(`${PORTAL}${path}`).set(headers);
  const staff = (over = {}) => ({
    tenantId: UNIT_REF.tenantId,
    userId: uuid(1),
    name: 'Sam',
    role: 'sales_manager',
    permissions: ['sales.view', 'sales.manage'],
    ...over,
  });

  beforeEach(async () => {
    t = await buildSalesTest();
    t.stores.customerRefs.set(OTHER, {
      ...CUSTOMER_REF,
      customerId: OTHER,
      fullName: 'Bilal Khan',
      email: 'bilal@example.test',
    });
    t.stores.unitRefs.set(uuid(102), { ...UNIT_REF, unitId: uuid(102), unitNo: 'A-02' });
    const book = (unitId, customerId) =>
      new CreateBooking(t.deps).execute({ actor: staff(), unitId, customerId, planId: t.plan.id });
    mine = await book(UNIT_REF.unitId, CUSTOMER_REF.customerId);
    theirs = await book(uuid(102), OTHER);
    mineAuth = await t.auth.customerBearer({
      customerId: CUSTOMER_REF.customerId,
      tenantId: UNIT_REF.tenantId,
    });
  });
  let mineAuth;

  it('lists only the signed-in customer’s own properties, newest first, in the customer-safe shape', async () => {
    const res = await get('/properties', mineAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.id)).toEqual([mine.id]);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      [
        'booked_at',
        'currency',
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
        'project_name',
        'received_amount',
        'status',
        'total_price',
        'unit_kind',
        'unit_no',
      ].sort(),
    );
    expect(res.body.data[0]).toMatchObject({
      unit_no: 'A-01',
      project_name: 'Gulberg Greens',
      status: 'requested',
      total_price: 1_000_000_00,
    });
    expect(JSON.stringify(res.body)).not.toMatch(
      /created_by|allowed_actions|buyer_|customer_id|tenant_id|unit_id/,
    );
  });

  it('shows a property by id, and says "not found" for somebody else’s, for a made-up id, and for another tenant', async () => {
    expect((await get(`/properties/${mine.id}`, mineAuth)).body).toMatchObject({
      id: mine.id,
      unit_no: 'A-01',
    });
    for (const id of [theirs.id, uuid(999), 'not-a-uuid'])
      expect((await get(`/properties/${id}`, mineAuth)).status).toBe(404);
    const stranger = await t.auth.customerBearer({
      customerId: CUSTOMER_REF.customerId,
      tenantId: TEST_TENANT_B,
    });
    expect((await get(`/properties/${mine.id}`, stranger)).status).toBe(404);
    expect((await get('/properties', stranger)).body.data).toEqual([]);
  });

  it('does not show a cancelled booking as one of their properties', async () => {
    t.stores.bookings.get(mine.id).status = 'cancelled';
    expect((await get('/properties', mineAuth)).body.data).toEqual([]);
    expect((await get(`/properties/${mine.id}`, mineAuth)).status).toBe(404);
  });

  it('pages with a cursor', async () => {
    t.stores.unitRefs.set(uuid(103), { ...UNIT_REF, unitId: uuid(103), unitNo: 'A-03' });
    await new CreateBooking(t.deps).execute({
      actor: staff(),
      unitId: uuid(103),
      customerId: CUSTOMER_REF.customerId,
      planId: t.plan.id,
    });
    const first = await get('/properties?limit=1', mineAuth);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await get(
      `/properties?limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`,
      mineAuth,
    );
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  it('keeps staff tokens out of the portal and customer tokens out of the staff API', async () => {
    const staffAuth = await t.auth.bearer({ role: 'owner', tenantId: UNIT_REF.tenantId });
    expect((await get('/properties', staffAuth)).status).toBe(401);
    expect((await get('/properties', {})).status).toBe(401);
    expect((await request(t.app).get('/api/v1/admin/bookings').set(mineAuth)).status).toBe(401);
  });
});
