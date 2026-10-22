import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import {
  TEST_TENANT_A,
  TEST_TENANT_B,
  deliverEvent,
  eventsOfType,
} from '@estateops/platform/testing';
import { buildInventoryTest } from './fakes.js';

const BASE = '/api/v1/admin';
const UNIT_BODY = {
  unit_no: 'A-01',
  kind: 'plot',
  area_value: 5,
  area_unit: 'marla',
  bedrooms: null,
  facing: 'North',
  view: null,
  corner: false,
  parking: 1,
  list_price: 1500000000,
  currency: 'PKR',
};
const UNIT_KEYS = [
  'allowed_actions',
  'area_unit',
  'area_value',
  'attributes',
  'bedrooms',
  'block_id',
  'block_name',
  'booking_id',
  'corner',
  'created_at',
  'created_by',
  'currency',
  'facing',
  'floor_id',
  'floor_label',
  'geometry',
  'id',
  'kind',
  'list_price',
  'parking',
  'phase_id',
  'project_id',
  'project_name',
  'status',
  'tenant_id',
  'unit_no',
  'updated_at',
  'view',
];

describe('inventory API', () => {
  let t;
  let owner;
  let project;
  const get = (path, h = owner) => request(t.app).get(`${BASE}${path}`).set(h);
  const post = (path, body, h = owner) => request(t.app).post(`${BASE}${path}`).set(h).send(body);
  const patch = (path, body, h = owner) => request(t.app).patch(`${BASE}${path}`).set(h).send(body);
  const del = (path, h = owner) => request(t.app).delete(`${BASE}${path}`).set(h);
  const makeUnit = async (over = {}) =>
    (await post('/units', { ...UNIT_BODY, project_id: project.id, ...over })).body;

  beforeEach(async () => {
    t = await buildInventoryTest();
    owner = await t.auth.bearer({ role: 'owner' });
    project = (
      await post('/projects', { name: 'Gulberg Greens', location: 'Lahore', kind: 'plot_society' })
    ).body;
  });

  describe('projects', () => {
    it('creates a project in the UI shape', async () => {
      expect(project).toMatchObject({
        name: 'Gulberg Greens',
        location: 'Lahore',
        kind: 'plot_society',
        tenant_id: TEST_TENANT_A,
        units_total: 0,
        unit_counts: { available: 0, held: 0, booked: 0, sold: 0, blocked: 0 },
        allowed_actions: ['update', 'delete'],
      });
      expect(Object.keys(project).sort()).toEqual([
        'allowed_actions',
        'created_at',
        'created_by',
        'id',
        'kind',
        'location',
        'name',
        'tenant_id',
        'unit_counts',
        'units_total',
        'updated_at',
      ]);
    });
    it('lists, reads, updates and deletes', async () => {
      await makeUnit();
      const list = await get('/projects');
      expect(list.body).toEqual({
        data: [
          expect.objectContaining({
            id: project.id,
            units_total: 1,
            unit_counts: expect.objectContaining({ available: 1 }),
          }),
        ],
        next_cursor: null,
      });
      expect((await get(`/projects/${project.id}`)).body.name).toBe('Gulberg Greens');
      const renamed = await patch(`/projects/${project.id}`, { name: 'Gulberg Heights' });
      expect(renamed.body).toMatchObject({ name: 'Gulberg Heights', units_total: 1 });
      expect((await del(`/projects/${project.id}`)).status).toBe(409);
      const empty = (await post('/projects', { name: 'Empty', kind: 'tower' })).body;
      expect((await del(`/projects/${empty.id}`)).status).toBe(204);
      expect((await get(`/projects/${empty.id}`)).status).toBe(404);
    });
    it('answers 422 with field details and 409 for a duplicate name', async () => {
      const bad = await post('/projects', { name: '', kind: 'castle' });
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d) => d.field).sort()).toEqual(['kind', 'name']);
      const dup = await post('/projects', { name: 'gulberg greens', kind: 'tower' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('PROJECT_NAME_TAKEN');
      expect((await patch(`/projects/${project.id}`, { tenant_id: 'x' })).status).toBe(422);
    });
    it('serves structure and a site plan after layout', async () => {
      const phase = (await post(`/projects/${project.id}/phases`, { name: 'Phase 1' })).body;
      const block = (
        await post(`/projects/${project.id}/blocks`, {
          name: 'Block A',
          kind: 'plot_block',
          phase_id: phase.id,
        })
      ).body;
      expect(block).toMatchObject({
        project_id: project.id,
        phase_id: phase.id,
        kind: 'plot_block',
      });
      const unit = await makeUnit({ block_id: block.id, phase_id: phase.id });
      expect(unit.block_name).toBe('Block A');
      expect((await post(`/projects/${project.id}/layout`, {})).body).toEqual({
        blocks: 1,
        units: 1,
      });
      const map = (await get(`/projects/${project.id}/map`)).body;
      expect(map).toMatchObject({
        project_id: project.id,
        project_name: 'Gulberg Greens',
        width: 1000,
        height: 640,
      });
      expect(map.blocks[0]).toEqual({
        id: block.id,
        name: 'Block A',
        kind: 'plot_block',
        x: expect.any(Number),
        y: expect.any(Number),
        w: expect.any(Number),
        h: expect.any(Number),
      });
      expect(map.shapes[0]).toMatchObject({
        unit_id: unit.id,
        unit_no: 'A-01',
        kind: 'plot',
        status: 'available',
      });
      const structure = (await get(`/projects/${project.id}/structure`)).body;
      expect(structure.phases).toHaveLength(1);
      expect(structure.blocks).toHaveLength(1);
    });
    it('manages blocks and floors by id', async () => {
      const tower = (
        await post(`/projects/${project.id}/blocks`, { name: 'Tower 1', kind: 'building' })
      ).body;
      const floor = await post(`/blocks/${tower.id}/floors`, { number: 3, label: 'Third' });
      expect(floor.status).toBe(201);
      expect(floor.body).toMatchObject({ block_id: tower.id, number: 3, label: 'Third' });
      expect((await post(`/blocks/${tower.id}/floors`, { number: 3 })).status).toBe(409);
      expect((await patch(`/blocks/${tower.id}`, { name: 'Tower A' })).body.name).toBe('Tower A');
      expect((await del(`/blocks/${tower.id}`)).status).toBe(409);
      expect((await del(`/floors/${floor.body.id}`)).status).toBe(204);
      expect((await del(`/blocks/${tower.id}`)).status).toBe(204);
      const phase = (await post(`/projects/${project.id}/phases`, { name: 'P' })).body;
      expect((await del(`/phases/${phase.id}`)).status).toBe(204);
    });
  });

  describe('units', () => {
    it('creates a unit and returns the full detail shape the UI parses', async () => {
      const res = await post('/units', { ...UNIT_BODY, project_id: project.id });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(
        [...UNIT_KEYS, 'media', 'status_history'].sort(),
      );
      expect(res.body).toMatchObject({
        unit_no: 'A-01',
        status: 'available',
        project_name: 'Gulberg Greens',
        area_value: 5,
        list_price: 1500000000,
        allowed_actions: ['hold', 'block'],
        media: [],
        booking_id: null,
      });
      expect(res.body.status_history).toEqual([
        expect.objectContaining({ status: 'available', changed_by_name: 'Test User' }),
      ]);
      expect(Date.parse(res.body.created_at)).not.toBeNaN();
    });
    it('lists without the detail-only fields, with filters, sort and cursor', async () => {
      await makeUnit({ unit_no: 'A-01', list_price: 300 });
      await makeUnit({ unit_no: 'A-02', kind: 'shop', list_price: 100 });
      await makeUnit({ unit_no: 'A-03', list_price: 200 });
      const all = await get('/units?sort=list_price:asc');
      expect(all.body.data.map((u) => u.list_price)).toEqual([100, 200, 300]);
      expect(Object.keys(all.body.data[0]).sort()).toEqual(UNIT_KEYS);
      expect((await get('/units?kind=shop')).body.data).toHaveLength(1);
      expect((await get(`/units?project_id=${project.id}&q=a-03`)).body.data).toHaveLength(1);
      const first = await get('/units?limit=2');
      expect(first.body.next_cursor).toEqual(expect.any(String));
      const second = await get(`/units?limit=2&cursor=${first.body.next_cursor}`);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.next_cursor).toBeNull();
      expect((await get('/units?sort=evil:asc')).status).toBe(422);
      expect((await get('/units?cursor=%23%23%23')).status).toBe(422);
    });
    it('answers the documented validation, conflict and not-found codes', async () => {
      const bad = await post('/units', {
        ...UNIT_BODY,
        project_id: project.id,
        unit_no: '',
        area_value: 0,
        currency: 'USD',
      });
      expect(bad.status).toBe(422);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect(bad.body.details.map((d) => d.field).sort()).toEqual([
        'area_value',
        'list_price',
        'unit_no',
      ]);
      expect((await post('/units', { project_id: 'nope' })).status).toBe(422);
      await makeUnit();
      const dup = await post('/units', { ...UNIT_BODY, project_id: project.id, unit_no: 'a-01' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('UNIT_NO_TAKEN');
      expect((await get('/units/00000000-0000-4000-8000-000000000404')).status).toBe(404);
      expect(
        (await post('/units', { ...UNIT_BODY, project_id: '00000000-0000-4000-8000-000000000404' }))
          .status,
      ).toBe(404);
    });
    it('blocks, unblocks, holds and releases, answering 409 INVALID_TRANSITION otherwise', async () => {
      const u = await makeUnit();
      const blocked = await post(`/units/${u.id}/block`, {});
      expect(blocked.body).toMatchObject({ status: 'blocked', allowed_actions: ['unblock'] });
      expect(blocked.body.status_history.map((h) => h.status)).toEqual(['available', 'blocked']);
      const again = await post(`/units/${u.id}/block`, {});
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({
        code: 'INVALID_TRANSITION',
        message: 'Cannot block a unit that is blocked',
      });
      expect((await post(`/units/${u.id}/unblock`, {})).body.status).toBe('available');
      expect((await post(`/units/${u.id}/hold`, {})).body.status).toBe('held');
      expect((await post(`/units/${u.id}/release`, {})).body.status).toBe('available');
    });
    it('edits and deletes, with 409 once the unit is booked', async () => {
      const u = await makeUnit();
      expect((await patch(`/units/${u.id}`, { list_price: 99, facing: null })).body).toMatchObject({
        list_price: 99,
        facing: null,
      });
      expect((await patch(`/units/${u.id}`, { project_id: 'x' })).status).toBe(422);
      expect((await del(`/units/${u.id}`)).status).toBe(204);
      const booked = await makeUnit({ unit_no: 'B-1' });
      await t.deps.uow.run((r) =>
        r.units.findById(TEST_TENANT_A, booked.id).then((x) =>
          r.units.update({
            ...x,
            status: 'booked',
            bookingId: '00000000-0000-4000-8000-000000000001',
            everBooked: true,
          }),
        ),
      );
      expect((await patch(`/units/${booked.id}`, { list_price: 1 })).body.code).toBe('UNIT_LOCKED');
      expect((await del(`/units/${booked.id}`)).body.code).toBe('UNIT_HAS_HISTORY');
    });
    it('keeps pictures for flats, not plots', async () => {
      const plot = await makeUnit();
      const flat = await makeUnit({ unit_no: 'T-1', kind: 'flat' });
      expect(
        (await post(`/units/${plot.id}/media`, { kind: 'image', url: 'https://cdn.test/a.jpg' }))
          .status,
      ).toBe(409);
      const media = await post(`/units/${flat.id}/media`, {
        kind: 'image',
        url: 'https://cdn.test/a.jpg',
        caption: 'Living room',
      });
      expect(media.status).toBe(201);
      expect(media.body).toEqual({
        id: expect.any(String),
        kind: 'image',
        url: 'https://cdn.test/a.jpg',
        caption: 'Living room',
      });
      expect((await get(`/units/${flat.id}`)).body.media).toHaveLength(1);
      expect(
        (await post(`/units/${flat.id}/media`, { kind: 'video', url: 'ftp://x' })).status,
      ).toBe(422);
      expect((await del(`/units/${flat.id}/media/${media.body.id}`)).status).toBe(204);
      expect((await del(`/units/${flat.id}/media/${media.body.id}`)).status).toBe(404);
      expect((await del(`/units/${flat.id}/media/not-a-uuid`)).status).toBe(404);
    });
  });

  describe('who may do what', () => {
    it('shows an agent units and projects with no actions, and refuses every write', async () => {
      const u = await makeUnit();
      const agent = await t.auth.bearer({ role: 'sales_agent' });
      const unit = await get(`/units/${u.id}`, agent);
      expect(unit.status).toBe(200);
      expect(unit.body.allowed_actions).toEqual([]);
      expect((await get('/projects', agent)).body.data[0].allowed_actions).toEqual([]);
      for (const [method, path, body] of [
        ['post', '/projects', { name: 'X', kind: 'tower' }],
        ['post', '/units', { ...UNIT_BODY, project_id: project.id, unit_no: 'Z' }],
        ['post', `/units/${u.id}/block`, {}],
        ['delete', `/units/${u.id}`, undefined],
      ]) {
        const res = await request(t.app)[method](`${BASE}${path}`).set(agent).send(body);
        expect([method, path, res.status]).toEqual([method, path, 403]);
      }
    });
    it('lets an inventory manager do the work, and a dealer manager see nothing', async () => {
      const manager = await t.auth.bearer({ role: 'inventory_manager' });
      expect((await post('/projects', { name: 'Maple', kind: 'mixed' }, manager)).status).toBe(201);
      const dealer = await t.auth.bearer({ role: 'dealer_manager' });
      expect((await get('/units', dealer)).status).toBe(403);
      expect((await get('/projects', dealer)).status).toBe(403);
    });
    it('needs a valid token and keeps tenants apart', async () => {
      expect((await request(t.app).get(`${BASE}/units`)).status).toBe(401);
      const u = await makeUnit();
      const stranger = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
      expect((await get(`/units/${u.id}`, stranger)).status).toBe(404);
      expect((await get('/units', stranger)).body.data).toEqual([]);
      expect((await get(`/projects/${project.id}`, stranger)).status).toBe(404);
      expect((await post(`/units/${u.id}/block`, {}, stranger)).status).toBe(404);
    });
  });

  describe('events', () => {
    const requested = (bookingId, unitId) =>
      buildEvent({
        type: EVENT.BOOKING_REQUESTED,
        tenantId: TEST_TENANT_A,
        producer: 'sales',
        data: {
          booking_id: bookingId,
          unit_id: unitId,
          customer_id: '00000000-0000-4000-8000-000000000009',
        },
      });
    const ids = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    it('reserves a unit for a booking request and acknowledges a replay', async () => {
      const u = await makeUnit();
      const event = requested(ids(1), u.id);
      expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: false });
      expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: true });
      const after = (await get(`/units/${u.id}`)).body;
      expect(after).toMatchObject({ status: 'booked', booking_id: ids(1), allowed_actions: [] });
      expect(eventsOfType(t.events, 'unit.booked')).toHaveLength(1);
    });
    it('sells and releases following the booking, and rejects a clash through an event', async () => {
      const a = await makeUnit();
      const b = await makeUnit({ unit_no: 'A-02' });
      await deliverEvent(t.app, requested(ids(1), a.id));
      await deliverEvent(t.app, requested(ids(2), b.id));
      await deliverEvent(t.app, requested(ids(3), a.id));
      expect(eventsOfType(t.events, 'unit.booking_rejected')[0].data).toMatchObject({
        booking_id: ids(3),
        reason: 'The unit is booked',
      });
      await deliverEvent(
        t.app,
        buildEvent({
          type: EVENT.BOOKING_COMPLETED,
          tenantId: TEST_TENANT_A,
          producer: 'sales',
          data: { booking_id: ids(1), unit_id: a.id },
        }),
      );
      await deliverEvent(
        t.app,
        buildEvent({
          type: EVENT.BOOKING_CANCELLED,
          tenantId: TEST_TENANT_A,
          producer: 'sales',
          data: { booking_id: ids(2), unit_id: b.id, customer_id: ids(9) },
        }),
      );
      expect((await get(`/units/${a.id}`)).body.status).toBe('sold');
      expect((await get(`/units/${b.id}`)).body.status).toBe('available');
    });
    it('learns the tenant currency from tenant.upserted, so units can be priced', async () => {
      const cold = await buildInventoryTest({ seedTenant: false });
      const token = await cold.auth.bearer({ role: 'owner' });
      const p = (
        await request(cold.app)
          .post(`${BASE}/projects`)
          .set(token)
          .send({ name: 'P', kind: 'tower' })
      ).body;
      const create = () =>
        request(cold.app)
          .post(`${BASE}/units`)
          .set(token)
          .send({ ...UNIT_BODY, project_id: p.id });
      expect((await create()).status).toBe(409);
      await deliverEvent(
        cold.app,
        buildEvent({
          type: EVENT.TENANT_UPSERTED,
          tenantId: TEST_TENANT_A,
          producer: 'identity',
          data: {
            slug: 'pk',
            name: 'Zameen',
            currency: 'PKR',
            locale: 'en-PK',
            time_zone: 'Asia/Karachi',
            area_unit: 'marla',
          },
        }),
      );
      expect((await create()).status).toBe(201);
    });
    it('needs the internal token and ignores events it does not consume', async () => {
      const u = await makeUnit();
      expect(
        (
          await request(t.app)
            .post('/internal/events')
            .send(requested(ids(1), u.id))
        ).status,
      ).toBe(401);
      const other = buildEvent({
        type: EVENT.PAYMENT_RECORDED,
        tenantId: TEST_TENANT_A,
        producer: 'billing',
        data: {
          payment_id: ids(1),
          installment_id: ids(2),
          booking_id: ids(3),
          amount: 1,
          source: 'manual',
        },
      });
      expect((await deliverEvent(t.app, other)).body).toEqual({ ignored: true });
    });
  });
});
