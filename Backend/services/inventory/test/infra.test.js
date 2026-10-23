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
  createFilesKit,
} from '@estateops/platform';
import {
  TEST_TENANT_A,
  TEST_TENANT_B,
  createTestAuth,
  createTestDatabase,
  deliverEvent,
  postgresAvailable,
} from '@estateops/platform/testing';
import { composeInventory } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { ReserveUnit } from '../src/units/application/ReserveUnit.js';
import { createProject } from '../src/projects/domain/project.js';
import { createUnit } from '../src/units/domain/unit.js';
import { createBlock, createFloor } from '../src/structure/domain/structure.js';
import { UNIT_FIELDS, clock } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[inventory db tests] no PostgreSQL reachable: skipping\n');

describe.skipIf(!available)('inventory on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  const run = (work) => uow.run(work);
  const uid = () => newId();
  const fileAsset = (tenantId, ownerId, over = {}) => ({
    id: uid(),
    tenantId,
    ownerType: 'unit',
    ownerId,
    purpose: 'unit_image',
    storedName: 'a.jpg',
    originalName: 'A.jpg',
    contentType: 'image/jpeg',
    size: 10,
    status: 'pending',
    createdBy: null,
    ...over,
  });

  const mkProject = async (tenantId = TEST_TENANT_A, name = `Project ${uid().slice(0, 6)}`) => {
    const p = createProject({ tenantId, name, kind: 'plot_society' });
    await run((r) => r.projects.insert(p));
    return p;
  };
  const mkUnit = async (project, over = {}, placement = {}) => {
    const u = createUnit({
      tenantId: project.tenantId,
      projectId: project.id,
      fields: { ...UNIT_FIELDS, unitNo: `U-${uid().slice(0, 8)}`, ...over },
      tenantCurrency: 'PKR',
      placement,
    });
    await run((r) => r.units.insert(u));
    return u;
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 10 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'inventory', buildRepos });
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  describe('constraints the database enforces', () => {
    it('keeps project names unique per tenant, ignoring case, but not across tenants', async () => {
      await mkProject(TEST_TENANT_A, 'Same Name');
      await expect(mkProject(TEST_TENANT_A, 'SAME NAME')).rejects.toMatchObject({
        code: 'PROJECT_NAME_TAKEN',
      });
      await expect(mkProject(TEST_TENANT_B, 'Same Name')).resolves.toBeTruthy();
    });

    it('keeps unit numbers unique within a project only', async () => {
      const a = await mkProject();
      const b = await mkProject();
      await mkUnit(a, { unitNo: 'X-1' });
      await expect(mkUnit(a, { unitNo: 'x-1' })).rejects.toMatchObject({ code: 'UNIT_NO_TAKEN' });
      await expect(mkUnit(b, { unitNo: 'X-1' })).resolves.toBeTruthy();
    });

    it('refuses a unit that has a booking but is still available, and a bad status or price', async () => {
      const p = await mkProject();
      const u = await mkUnit(p);
      const sql = (set) => ds.query(`UPDATE inventory.unit SET ${set} WHERE id = $1`, [u.id]);
      await expect(sql(`booking_id = '${uid()}'`)).rejects.toMatchObject({
        driverError: { constraint: 'unit_booking_status_chk' },
      });
      await expect(sql(`status = 'lost'`)).rejects.toMatchObject({
        driverError: { constraint: 'unit_status_chk' },
      });
      await expect(sql('list_price = -1')).rejects.toMatchObject({
        driverError: { constraint: 'unit_price_chk' },
      });
      await expect(sql('area_value = 0')).rejects.toMatchObject({
        driverError: { constraint: 'unit_area_chk' },
      });
    });

    it('protects structure with foreign keys: a project, block or floor in use cannot be deleted', async () => {
      const p = await mkProject();
      const block = createBlock({
        tenantId: p.tenantId,
        projectId: p.id,
        name: 'Tower',
        kind: 'building',
      });
      await run((r) => r.structure.insertBlock(block));
      const floor = createFloor({ tenantId: p.tenantId, blockId: block.id, number: 1 });
      await run((r) => r.structure.insertFloor(floor));
      await mkUnit(p, {}, { blockId: block.id, floorId: floor.id });
      await expect(
        ds.query('DELETE FROM inventory.project WHERE id = $1', [p.id]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      await expect(
        ds.query('DELETE FROM inventory.floor WHERE id = $1', [floor.id]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      expect(await run((r) => r.structure.floorInUse(p.tenantId, floor.id))).toBe(true);
      expect(await run((r) => r.structure.blockInUse(p.tenantId, block.id))).toBe(true);
      await expect(
        run((r) =>
          r.structure.insertFloor(
            createFloor({ tenantId: p.tenantId, blockId: block.id, number: 1 }),
          ),
        ),
      ).rejects.toMatchObject({ code: 'FLOOR_NUMBER_TAKEN' });
    });
  });

  describe('repositories', () => {
    it('round-trips a unit including numeric and bigint columns', async () => {
      const p = await mkProject();
      const u = await mkUnit(p, {
        areaValue: 7.5,
        listPrice: 9_007_199_254_740,
        bedrooms: 3,
        view: 'Park',
        corner: true,
      });
      const found = await run((r) => r.units.findById(p.tenantId, u.id));
      expect(found).toMatchObject({
        areaValue: 7.5,
        listPrice: 9_007_199_254_740,
        bedrooms: 3,
        view: 'Park',
        corner: true,
        currency: 'PKR',
        status: 'available',
        version: 1,
      });
      expect(found.createdAt).toBeInstanceOf(Date);
    });

    it('detects a concurrent edit through the version', async () => {
      const p = await mkProject();
      const u = await mkUnit(p);
      const saved = await run((r) => r.units.update({ ...u, listPrice: 1 }));
      expect(saved.version).toBe(2);
      await expect(run((r) => r.units.update({ ...u, listPrice: 2 }))).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
    });

    it('sorts a list by numeric, price, text and status columns and pages through every row', async () => {
      const p = await mkProject();
      for (let i = 0; i < 14; i += 1)
        await mkUnit(p, {
          unitNo: `S-${String(i).padStart(2, '0')}`,
          areaValue: [5, 10, 7.5, 1][i % 4],
          listPrice: 1000 + ((i * 7) % 14),
          kind: i % 2 ? 'shop' : 'plot',
        });
      const walk = async (sort, limit = 5) => {
        const rows = [];
        let cursor;
        do {
          const page = await run((r) =>
            r.units.list(p.tenantId, { projectId: p.id, sort, cursor, limit }),
          );
          rows.push(...page.items.map((v) => v.unit));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return rows;
      };
      for (const [sort, pick] of [
        ['area_value:asc', (u) => u.areaValue],
        ['area_value:desc', (u) => u.areaValue],
        ['list_price:asc', (u) => u.listPrice],
        ['list_price:desc', (u) => u.listPrice],
        ['unit_no:desc', (u) => u.unitNo],
      ]) {
        const rows = await walk(sort);
        expect(rows, sort).toHaveLength(14);
        expect(new Set(rows.map((u) => u.id)).size).toBe(14);
        const values = rows.map(pick);
        const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        expect(values, sort).toEqual(sort.endsWith('desc') ? sorted.reverse() : sorted);
      }
    });

    it('filters by status, kind, project and text (including joined project and block names) within the tenant', async () => {
      const p = await mkProject(TEST_TENANT_A, 'Findable Heights');
      const other = await mkProject(TEST_TENANT_B);
      const block = createBlock({
        tenantId: p.tenantId,
        projectId: p.id,
        name: 'Wing Q',
        kind: 'plot_block',
      });
      await run((r) => r.structure.insertBlock(block));
      const inBlock = await mkUnit(p, { unitNo: 'Z-100' }, { blockId: block.id });
      const shop = await mkUnit(p, { unitNo: 'Z-200', kind: 'shop' });
      await run((r) => r.units.update({ ...shop, status: 'blocked' }));
      await mkUnit(other, { unitNo: 'Z-100' });
      const list = (f) =>
        run((r) => r.units.list(p.tenantId, f)).then((pg) => pg.items.map((v) => v.unit.unitNo));
      expect(await list({ projectId: p.id })).toEqual(['Z-100', 'Z-200']);
      expect(await list({ projectId: p.id, status: 'blocked' })).toEqual(['Z-200']);
      expect(await list({ projectId: p.id, kind: 'shop' })).toEqual(['Z-200']);
      expect(await list({ q: 'findable' })).toEqual(['Z-100', 'Z-200']);
      expect(await list({ q: 'wing q' })).toEqual(['Z-100']);
      expect(await list({ q: '100', projectId: p.id })).toEqual(['Z-100']);
      expect(await list({ q: '%' })).toEqual([]);
      const view = await run((r) => r.units.findDetail(p.tenantId, inBlock.id));
      expect(view).toMatchObject({
        projectName: 'Findable Heights',
        blockName: 'Wing Q',
        floorLabel: null,
      });
    });

    it('counts units per status for a project and for the project list', async () => {
      const p = await mkProject();
      const a = await mkUnit(p);
      await mkUnit(p);
      await run((r) => r.units.update({ ...a, status: 'blocked' }));
      const found = await run((r) => r.projects.findWithCounts(p.tenantId, p.id));
      expect(found).toMatchObject({
        unitsTotal: 2,
        unitCounts: { available: 1, blocked: 1, held: 0, booked: 0, sold: 0 },
      });
      expect(await run((r) => r.projects.childCounts(p.tenantId, p.id))).toEqual({
        units: 2,
        phases: 0,
        blocks: 0,
      });
      const listed = await run((r) => r.projects.list(p.tenantId, { limit: 200 }));
      expect(listed.items.find((i) => i.project.id === p.id).unitsTotal).toBe(2);
    });

    it('deletes a unit with its history and pictures, and lists map shapes after layout', async () => {
      const p = await mkProject();
      const flat = await mkUnit(p, { kind: 'flat' });
      await run(async (r) => {
        await r.unitHistory.add({
          tenantId: p.tenantId,
          unitId: flat.id,
          status: 'available',
          changedBy: null,
          changedByName: 'x',
        });
        const file = fileAsset(p.tenantId, flat.id);
        await r.fileAssets.insert(file);
        await r.unitMedia.add({
          id: uid(),
          tenantId: p.tenantId,
          unitId: flat.id,
          kind: 'image',
          fileId: file.id,
          caption: null,
          sortOrder: 0,
        });
        expect((await r.unitMedia.list(flat.id))[0].asset).toMatchObject({
          storedName: 'a.jpg',
          ownerId: flat.id,
        });
        await r.units.saveGeometry(p.tenantId, [
          { unitId: flat.id, geometry: { type: 'rect', x: 1, y: 2, w: 3, h: 4 } },
        ]);
      });
      expect(await run((r) => r.units.listShapes(p.tenantId, p.id))).toEqual([
        expect.objectContaining({ unitId: flat.id, x: 1, y: 2, w: 3, h: 4 }),
      ]);
      await run((r) => r.units.delete(p.tenantId, flat.id));
      expect(
        await ds.query('SELECT 1 FROM inventory.unit_media WHERE unit_id = $1', [flat.id]),
      ).toHaveLength(0);
      expect(
        await ds.query('SELECT 1 FROM inventory.unit_status_history WHERE unit_id = $1', [flat.id]),
      ).toHaveLength(0);
    });

    it('stores file assets, finds the newest ready one and lists stale uploads', async () => {
      const p = await mkProject();
      const a = fileAsset(p.tenantId, p.id, { ownerType: 'project', purpose: 'site_map' });
      const b = fileAsset(p.tenantId, p.id, { ownerType: 'project', purpose: 'site_map' });
      await run(async (r) => {
        await r.fileAssets.insert(a);
        await r.fileAssets.insert(b);
        expect(await r.fileAssets.latestReady(p.tenantId, 'project', p.id, 'site_map')).toBeNull();
        await r.fileAssets.setStatus(p.tenantId, a.id, 'ready');
        await r.fileAssets.setStatus(p.tenantId, b.id, 'ready');
        expect((await r.fileAssets.latestReady(p.tenantId, 'project', p.id, 'site_map')).id).toBe(
          b.id,
        );
        expect(await r.fileAssets.findById(p.tenantId, 'not-a-uuid')).toBeNull();
        expect(await r.fileAssets.findById(uid(), a.id)).toBeNull();
      });
      const stale = fileAsset(p.tenantId, p.id);
      await run((r) => r.fileAssets.insert(stale));
      await ds.query(
        "UPDATE inventory.file_asset SET created_at = now() - interval '2 days' WHERE id = $1",
        [stale.id],
      );
      const found = await run((r) => r.fileAssets.listStalePending(60 * 60 * 1000));
      expect(found.map((f) => f.id)).toContain(stale.id);
    });

    it('keeps the newest tenant snapshot when events arrive out of order', async () => {
      const ref = (currency) => ({
        tenantId: TEST_TENANT_B,
        slug: 'ae',
        name: 'Desert Rose',
        currency,
        locale: 'en-AE',
        timeZone: 'Asia/Dubai',
        areaUnit: 'sq_ft',
      });
      expect(await run((r) => r.tenantRefs.upsert(ref('AED'), '2026-10-21T10:00:00.000Z'))).toBe(
        true,
      );
      expect(await run((r) => r.tenantRefs.upsert(ref('USD'), '2026-10-21T09:00:00.000Z'))).toBe(
        false,
      );
      expect((await run((r) => r.tenantRefs.get(TEST_TENANT_B))).currency).toBe('AED');
      expect(await run((r) => r.tenantRefs.upsert(ref('AED'), '2026-10-21T10:00:00.000Z'))).toBe(
        true,
      );
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of several simultaneous booking requests win a unit', async () => {
      const p = await mkProject();
      const u = await mkUnit(p);
      const reserve = new ReserveUnit({ uow, clock });
      const event = (n) =>
        buildEvent({
          type: EVENT.BOOKING_REQUESTED,
          tenantId: p.tenantId,
          producer: 'sales',
          data: { booking_id: uid(), unit_id: u.id, customer_id: uid() },
          now: new Date(Date.now() + n),
        });
      await Promise.all([1, 2, 3, 4, 5, 6].map((n) => reserve.execute(event(n))));
      const booked = await ds.query(
        `SELECT count(*)::int AS n FROM inventory.outbox WHERE type = 'unit.booked' AND payload->'data'->>'unit_id' = $1`,
        [u.id],
      );
      const rejected = await ds.query(
        `SELECT count(*)::int AS n FROM inventory.outbox WHERE type = 'unit.booking_rejected' AND payload->'data'->>'unit_id' = $1`,
        [u.id],
      );
      expect([booked[0].n, rejected[0].n]).toEqual([1, 5]);
      const final = await run((r) => r.units.findById(p.tenantId, u.id));
      expect(final.status).toBe('booked');
      expect(final.bookingId).toBeTruthy();
    });

    it('serialises two staff acting on the same unit: the second sees the new state', async () => {
      const p = await mkProject();
      const u = await mkUnit(p);
      const { ActOnUnit } = await import('../src/units/application/ActOnUnit.js');
      const act = new ActOnUnit({ uow, clock });
      const actor = {
        tenantId: p.tenantId,
        userId: uid(),
        name: 'S',
        role: 'owner',
        permissions: ['inventory.manage'],
      };
      const results = await Promise.allSettled([
        act.execute({ actor, id: u.id, action: 'block' }),
        act.execute({ actor, id: u.id, action: 'block' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });
  });

  describe('the whole service on the real stack', () => {
    it('serves projects, units and the booking events end to end, with audit and outbox committed', async () => {
      const auth = await createTestAuth();
      const app = composeInventory({
        uow,
        clock,
        verifier: auth.verifier,
        logger: silentLogger,
        internalToken: 'test-internal-token',
        idempotencyStore: createIdempotencyStore(ds, { schema: 'inventory' }),
        readyCheck: () => ds.query('SELECT 1'),
        files: createFilesKit({ STORAGE_PUBLIC_BASE_URL: 'https://cdn.test' }),
      });
      const tenantId = newId();
      await deliverEvent(
        app,
        buildEvent({
          type: EVENT.TENANT_UPSERTED,
          tenantId,
          producer: 'identity',
          data: {
            slug: 'e2e',
            name: 'E2E',
            currency: 'PKR',
            locale: 'en-PK',
            time_zone: 'Asia/Karachi',
            area_unit: 'marla',
          },
        }),
      );
      const owner = await auth.bearer({ role: 'owner', tenantId });
      const api = (method, path, body) =>
        request(app)[method](`/api/v1/admin${path}`).set(owner).send(body);

      const project = (
        await api('post', '/projects', { name: 'Gulberg Greens', kind: 'plot_society' })
      ).body;
      const unit = await api('post', '/units', {
        project_id: project.id,
        unit_no: 'A-01',
        kind: 'plot',
        area_value: 5,
        area_unit: 'marla',
        bedrooms: null,
        facing: null,
        view: null,
        corner: false,
        parking: 0,
        list_price: 15000000000,
        currency: 'PKR',
      });
      expect(unit.status).toBe(201);
      expect(
        (
          await api('post', '/units', {
            project_id: project.id,
            unit_no: 'a-01',
            kind: 'plot',
            area_value: 5,
            area_unit: 'marla',
            list_price: 1,
            currency: 'PKR',
          })
        ).status,
      ).toBe(409);

      const bookingId = newId();
      await deliverEvent(
        app,
        buildEvent({
          type: EVENT.BOOKING_REQUESTED,
          tenantId,
          producer: 'sales',
          data: { booking_id: bookingId, unit_id: unit.body.id, customer_id: newId() },
        }),
      );
      const booked = (await api('get', `/units/${unit.body.id}`)).body;
      expect(booked).toMatchObject({
        status: 'booked',
        booking_id: bookingId,
        allowed_actions: [],
      });
      expect(booked.status_history.map((h) => h.status)).toEqual(['available', 'booked']);
      await deliverEvent(
        app,
        buildEvent({
          type: EVENT.BOOKING_COMPLETED,
          tenantId,
          producer: 'sales',
          data: { booking_id: bookingId, unit_id: unit.body.id },
        }),
      );
      expect((await api('get', `/units/${unit.body.id}`)).body.status).toBe('sold');
      expect((await api('get', '/projects')).body.data[0].unit_counts.sold).toBe(1);

      const types = (
        await ds.query(
          `SELECT type FROM inventory.outbox WHERE tenant_id = $1 ORDER BY created_at`,
          [tenantId],
        )
      ).map((r) => r.type);
      expect(types).toEqual(
        expect.arrayContaining(['project.upserted', 'unit.upserted', 'unit.booked']),
      );
      const audit = (
        await ds.query(`SELECT action FROM inventory.audit_log WHERE tenant_id = $1`, [tenantId])
      ).map((r) => r.action);
      expect(audit).toEqual(
        expect.arrayContaining(['project.create', 'unit.create', 'unit.book', 'unit.sell']),
      );
      expect((await request(app).get('/health/ready')).status).toBe(200);
    });
  });
});
