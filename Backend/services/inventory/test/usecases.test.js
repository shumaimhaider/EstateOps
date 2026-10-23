import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B, eventsOfType } from '@estateops/platform/testing';
import { CreateProject } from '../src/projects/application/CreateProject.js';
import { UpdateProject } from '../src/projects/application/UpdateProject.js';
import { DeleteProject } from '../src/projects/application/DeleteProject.js';
import { ListProjects } from '../src/projects/application/ListProjects.js';
import { GetProject } from '../src/projects/application/GetProject.js';
import { GetProjectMap } from '../src/projects/application/GetProjectMap.js';
import { LayoutProject } from '../src/layout/application/LayoutProject.js';
import { CreatePhase } from '../src/structure/application/CreatePhase.js';
import { DeletePhase } from '../src/structure/application/DeletePhase.js';
import { CreateBlock } from '../src/structure/application/CreateBlock.js';
import { UpdateBlock } from '../src/structure/application/UpdateBlock.js';
import { DeleteBlock } from '../src/structure/application/DeleteBlock.js';
import { CreateFloor } from '../src/structure/application/CreateFloor.js';
import { DeleteFloor } from '../src/structure/application/DeleteFloor.js';
import { GetProjectStructure } from '../src/structure/application/GetProjectStructure.js';
import { CreateUnit } from '../src/units/application/CreateUnit.js';
import { UpdateUnit } from '../src/units/application/UpdateUnit.js';
import { DeleteUnit } from '../src/units/application/DeleteUnit.js';
import { ListUnits } from '../src/units/application/ListUnits.js';
import { GetUnit } from '../src/units/application/GetUnit.js';
import { ActOnUnit } from '../src/units/application/ActOnUnit.js';
import { AddUnitMedia } from '../src/units/application/AddUnitMedia.js';
import { RequestUnitMediaUpload } from '../src/units/application/RequestUnitMediaUpload.js';
import { RequestProjectMapUpload } from '../src/projects/application/RequestProjectMapUpload.js';
import { ConfirmProjectMap } from '../src/projects/application/ConfirmProjectMap.js';
import { RemoveUnitMedia } from '../src/units/application/RemoveUnitMedia.js';
import { ReserveUnit } from '../src/units/application/ReserveUnit.js';
import { FollowBooking } from '../src/units/application/FollowBooking.js';
import { ApplyTenant } from '../src/tenants/application/ApplyTenant.js';
import { UNIT_FIELDS, actor, buildInventoryTest, putFile } from './fakes.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const booking = (type, bookingId, unitId, tenantId = TEST_TENANT_A) =>
  buildEvent({
    type,
    tenantId,
    producer: 'sales',
    data:
      type === EVENT.BOOKING_REQUESTED
        ? { booking_id: bookingId, unit_id: unitId, customer_id: uuid(9) }
        : {
            booking_id: bookingId,
            unit_id: unitId,
            ...(type === EVENT.BOOKING_CANCELLED ? { customer_id: uuid(9) } : {}),
          },
  });

describe('inventory use cases', () => {
  let t;
  let owner;
  let project;
  beforeEach(async () => {
    t = await buildInventoryTest();
    owner = actor('owner');
    project = await new CreateProject(t.deps).execute({
      actor: owner,
      name: 'Gulberg Greens',
      location: 'Lahore',
      kind: 'plot_society',
    });
  });
  const unitIn = (over = {}, a = owner) =>
    new CreateUnit(t.deps).execute({
      actor: a,
      projectId: project.id,
      fields: { ...UNIT_FIELDS, ...over },
    });

  describe('projects', () => {
    it('creates a project, audits it and announces it', () => {
      expect(project).toMatchObject({
        name: 'Gulberg Greens',
        tenantId: TEST_TENANT_A,
        createdBy: owner.userId,
      });
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'project.create' });
      expect(eventsOfType(t.events, 'project.upserted')[0].data).toEqual({
        project_id: project.id,
        name: 'Gulberg Greens',
        kind: 'plot_society',
      });
    });
    it('refuses a duplicate name in any case, but allows it in another tenant', async () => {
      await expect(
        new CreateProject(t.deps).execute({ actor: owner, name: 'GULBERG greens', kind: 'tower' }),
      ).rejects.toMatchObject({ code: 'PROJECT_NAME_TAKEN' });
      const other = await new CreateProject(t.deps).execute({
        actor: actor('owner', { tenantId: TEST_TENANT_B }),
        name: 'Gulberg Greens',
        kind: 'tower',
      });
      expect(other.tenantId).toBe(TEST_TENANT_B);
    });
    it('renames and re-announces, refusing a clash', async () => {
      const second = await new CreateProject(t.deps).execute({
        actor: owner,
        name: 'Skyline Tower',
        kind: 'tower',
      });
      const saved = await new UpdateProject(t.deps).execute({
        actor: owner,
        id: project.id,
        patch: { name: 'Gulberg Heights' },
      });
      expect(saved).toMatchObject({ name: 'Gulberg Heights', version: 2 });
      expect(eventsOfType(t.events, 'project.upserted')).toHaveLength(3);
      await expect(
        new UpdateProject(t.deps).execute({
          actor: owner,
          id: second.id,
          patch: { name: 'gulberg heights' },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_NAME_TAKEN' });
      await expect(
        new UpdateProject(t.deps).execute({ actor: owner, id: uuid(404), patch: {} }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('lists and reads with live unit counts per status', async () => {
      const u = await unitIn();
      await unitIn({ unitNo: 'A-02' });
      await new ActOnUnit(t.deps).execute({ actor: owner, id: u.id, action: 'block' });
      const got = await new GetProject(t.deps).execute({ actor: owner, id: project.id });
      expect(got).toMatchObject({
        unitsTotal: 2,
        unitCounts: { available: 1, blocked: 1, booked: 0, held: 0, sold: 0 },
        allowedActions: ['update', 'delete'],
      });
      const list = await new ListProjects(t.deps).execute({ actor: owner });
      expect(list.items).toHaveLength(1);
      expect(list.items[0].unitsTotal).toBe(2);
    });
    it('shows no edit actions to someone who cannot manage inventory', async () => {
      const agent = actor('sales_agent');
      expect(
        (await new GetProject(t.deps).execute({ actor: agent, id: project.id })).allowedActions,
      ).toEqual([]);
    });
    it('deletes only an empty project', async () => {
      const u = await unitIn();
      await expect(
        new DeleteProject(t.deps).execute({ actor: owner, id: project.id }),
      ).rejects.toMatchObject({ code: 'PROJECT_NOT_EMPTY' });
      await new DeleteUnit(t.deps).execute({ actor: owner, id: u.id });
      await new DeleteProject(t.deps).execute({ actor: owner, id: project.id });
      await expect(
        new GetProject(t.deps).execute({ actor: owner, id: project.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('hides another tenant’s project', async () => {
      const stranger = actor('owner', { tenantId: TEST_TENANT_B });
      await expect(
        new GetProject(t.deps).execute({ actor: stranger, id: project.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new DeleteProject(t.deps).execute({ actor: stranger, id: project.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect((await new ListProjects(t.deps).execute({ actor: stranger })).items).toHaveLength(0);
    });
  });

  describe('structure and site plan', () => {
    it('builds phases, blocks and floors with their rules', async () => {
      const phase = await new CreatePhase(t.deps).execute({
        actor: owner,
        projectId: project.id,
        name: 'Phase 1',
      });
      await expect(
        new CreatePhase(t.deps).execute({ actor: owner, projectId: project.id, name: 'phase 1' }),
      ).rejects.toMatchObject({ code: 'PHASE_NAME_TAKEN' });
      const plots = await new CreateBlock(t.deps).execute({
        actor: owner,
        projectId: project.id,
        phaseId: phase.id,
        name: 'Block A',
        kind: 'plot_block',
      });
      await expect(
        new CreateBlock(t.deps).execute({
          actor: owner,
          projectId: project.id,
          name: 'block a',
          kind: 'plot_block',
        }),
      ).rejects.toMatchObject({ code: 'BLOCK_NAME_TAKEN' });
      await expect(
        new CreateFloor(t.deps).execute({ actor: owner, blockId: plots.id, number: 1 }),
      ).rejects.toMatchObject({ code: 'NOT_A_BUILDING' });
      const tower = await new CreateBlock(t.deps).execute({
        actor: owner,
        projectId: project.id,
        name: 'Tower 1',
        kind: 'building',
      });
      const floor = await new CreateFloor(t.deps).execute({
        actor: owner,
        blockId: tower.id,
        number: 1,
      });
      await expect(
        new CreateFloor(t.deps).execute({ actor: owner, blockId: tower.id, number: 1 }),
      ).rejects.toMatchObject({ code: 'FLOOR_NUMBER_TAKEN' });
      const structure = await new GetProjectStructure(t.deps).execute({
        actor: owner,
        projectId: project.id,
      });
      expect(structure).toMatchObject({
        phases: [{ name: 'Phase 1' }],
        blocks: [{}, {}],
        floors: [{ number: 1 }],
      });

      const renamed = await new UpdateBlock(t.deps).execute({
        actor: owner,
        id: plots.id,
        patch: { name: 'Block Z' },
      });
      expect(renamed.name).toBe('Block Z');
      await expect(
        new UpdateBlock(t.deps).execute({ actor: owner, id: plots.id, patch: { name: 'tower 1' } }),
      ).rejects.toMatchObject({ code: 'BLOCK_NAME_TAKEN' });

      await expect(
        new DeletePhase(t.deps).execute({ actor: owner, id: phase.id }),
      ).rejects.toMatchObject({ code: 'PHASE_IN_USE' });
      await expect(
        new DeleteBlock(t.deps).execute({ actor: owner, id: tower.id }),
      ).rejects.toMatchObject({ code: 'BLOCK_IN_USE' });
      await new DeleteFloor(t.deps).execute({ actor: owner, id: floor.id });
      await new DeleteBlock(t.deps).execute({ actor: owner, id: tower.id });
      await new UpdateBlock(t.deps).execute({
        actor: owner,
        id: plots.id,
        patch: { phaseId: null },
      });
      await new DeletePhase(t.deps).execute({ actor: owner, id: phase.id });
    });
    it('refuses a block from another project, a phase of another project, and a missing project', async () => {
      const other = await new CreateProject(t.deps).execute({
        actor: owner,
        name: 'Other',
        kind: 'tower',
      });
      const foreignPhase = await new CreatePhase(t.deps).execute({
        actor: owner,
        projectId: other.id,
        name: 'P',
      });
      await expect(
        new CreateBlock(t.deps).execute({
          actor: owner,
          projectId: project.id,
          phaseId: foreignPhase.id,
          name: 'B',
          kind: 'plot_block',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new CreatePhase(t.deps).execute({ actor: owner, projectId: uuid(404), name: 'P' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('lays out the site plan and serves it as a map of blocks and unit shapes', async () => {
      const block = await new CreateBlock(t.deps).execute({
        actor: owner,
        projectId: project.id,
        name: 'Block A',
        kind: 'plot_block',
      });
      for (const n of [1, 2, 3, 4, 5])
        await unitIn({ unitNo: `A-0${n}` }).then(
          (u) => (t.stores.units.get(u.id).blockId = block.id),
        );
      expect(
        (await new GetProjectMap(t.deps).execute({ actor: owner, id: project.id })).shapes,
      ).toHaveLength(0);
      expect(await new LayoutProject(t.deps).execute({ actor: owner, id: project.id })).toEqual({
        blocks: 1,
        units: 5,
      });
      const map = await new GetProjectMap(t.deps).execute({ actor: owner, id: project.id });
      expect(map).toMatchObject({ width: 1000, height: 640 });
      expect(map.blocks).toHaveLength(1);
      expect(map.shapes).toHaveLength(5);
      expect(map.shapes[0]).toMatchObject({ kind: 'plot', status: 'available' });
    });
  });

  describe('units', () => {
    it('creates a unit with history, audit and an announcement carrying the project name', async () => {
      const u = await unitIn();
      expect(u).toMatchObject({
        status: 'available',
        projectId: project.id,
        createdBy: owner.userId,
      });
      await expect(t.repos.unitHistory.list(u.id)).resolves.toEqual([
        expect.objectContaining({ status: 'available', changedByName: 'Test User' }),
      ]);
      const [e] = eventsOfType(t.events, 'unit.upserted');
      expect(e.data).toMatchObject({
        unit_id: u.id,
        project_name: 'Gulberg Greens',
        unit_no: 'A-01',
        status: 'available',
        currency: 'PKR',
      });
    });
    it('needs the tenant to have arrived, and the price in its currency', async () => {
      const cold = await buildInventoryTest({ seedTenant: false });
      const p = await new CreateProject(cold.deps).execute({
        actor: owner,
        name: 'P',
        kind: 'tower',
      });
      await expect(
        new CreateUnit(cold.deps).execute({ actor: owner, projectId: p.id, fields: UNIT_FIELDS }),
      ).rejects.toMatchObject({ code: 'TENANT_NOT_READY' });
      await expect(unitIn({ currency: 'USD' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
    it('refuses a duplicate unit number in the project (any case) but not in another project', async () => {
      await unitIn();
      await expect(unitIn({ unitNo: 'a-01' })).rejects.toMatchObject({ code: 'UNIT_NO_TAKEN' });
      const other = await new CreateProject(t.deps).execute({
        actor: owner,
        name: 'Other',
        kind: 'tower',
      });
      await expect(
        new CreateUnit(t.deps).execute({ actor: owner, projectId: other.id, fields: UNIT_FIELDS }),
      ).resolves.toBeTruthy();
      await expect(
        new CreateUnit(t.deps).execute({
          actor: owner,
          projectId: uuid(404),
          fields: { ...UNIT_FIELDS, unitNo: 'Z' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('checks the placement belongs to the project', async () => {
      const other = await new CreateProject(t.deps).execute({
        actor: owner,
        name: 'Other',
        kind: 'tower',
      });
      const foreign = await new CreateBlock(t.deps).execute({
        actor: owner,
        projectId: other.id,
        name: 'B',
        kind: 'plot_block',
      });
      await expect(
        new CreateUnit(t.deps).execute({
          actor: owner,
          projectId: project.id,
          fields: UNIT_FIELDS,
          placement: { blockId: foreign.id },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('updates a free unit and re-announces; a booked unit is locked; a clash is refused', async () => {
      const u = await unitIn();
      const second = await unitIn({ unitNo: 'A-02' });
      const saved = await new UpdateUnit(t.deps).execute({
        actor: owner,
        id: u.id,
        fields: { listPrice: 99, facing: 'South' },
      });
      expect(saved).toMatchObject({ listPrice: 99, facing: 'South', version: 2 });
      expect(eventsOfType(t.events, 'unit.upserted').at(-1).data.list_price).toBe(99);
      await expect(
        new UpdateUnit(t.deps).execute({ actor: owner, id: second.id, fields: { unitNo: 'a-01' } }),
      ).rejects.toMatchObject({ code: 'UNIT_NO_TAKEN' });
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id));
      await expect(
        new UpdateUnit(t.deps).execute({ actor: owner, id: u.id, fields: { listPrice: 1 } }),
      ).rejects.toMatchObject({ code: 'UNIT_LOCKED' });
    });
    it('deletes a never-booked unit with its history, and refuses one that was booked', async () => {
      const free = await unitIn();
      await new DeleteUnit(t.deps).execute({ actor: owner, id: free.id });
      expect(t.stores.history.filter((h) => h.unitId === free.id)).toHaveLength(0);
      const sold = await unitIn({ unitNo: 'A-02' });
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), sold.id));
      await new FollowBooking({ ...t.deps, mode: 'release' }).execute(
        booking(EVENT.BOOKING_CANCELLED, uuid(1), sold.id),
      );
      await expect(
        new DeleteUnit(t.deps).execute({ actor: owner, id: sold.id }),
      ).rejects.toMatchObject({ code: 'UNIT_HAS_HISTORY' });
    });
    it('lists with filters and paging, shows joined names, and only the tenant’s units', async () => {
      const block = await new CreateBlock(t.deps).execute({
        actor: owner,
        projectId: project.id,
        name: 'Block A',
        kind: 'plot_block',
      });
      const a = await unitIn({ unitNo: 'A-01', listPrice: 300 });
      const b = await unitIn({ unitNo: 'A-02', kind: 'shop', listPrice: 100 });
      await unitIn({ unitNo: 'A-03', listPrice: 200 });
      t.stores.units.get(a.id).blockId = block.id;
      await new ActOnUnit(t.deps).execute({ actor: owner, id: b.id, action: 'block' });
      await new CreateUnit(t.deps)
        .execute({
          actor: actor('owner', { tenantId: TEST_TENANT_B }),
          projectId: uuid(404),
          fields: UNIT_FIELDS,
        })
        .catch(() => {});
      const list = (filters) => new ListUnits(t.deps).execute({ actor: owner, ...filters });
      expect((await list({})).items).toHaveLength(3);
      expect((await list({ kind: 'shop' })).items.map((i) => i.unit.unitNo)).toEqual(['A-02']);
      expect((await list({ status: 'blocked' })).items).toHaveLength(1);
      expect((await list({ q: 'block a' })).items.map((i) => i.unit.unitNo)).toEqual(['A-01']);
      expect((await list({ sort: 'list_price:asc' })).items.map((i) => i.unit.listPrice)).toEqual([
        100, 200, 300,
      ]);
      expect((await list({ sort: 'list_price:desc' })).items.map((i) => i.unit.listPrice)).toEqual([
        300, 200, 100,
      ]);
      await expect(list({ sort: 'password:asc' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      const first = await list({ limit: 2 });
      expect(first.items).toHaveLength(2);
      expect((await list({ limit: 2, cursor: first.nextCursor })).items).toHaveLength(1);
      expect((await list({})).items[0]).toMatchObject({
        projectName: 'Gulberg Greens',
        allowedActions: ['hold', 'block'],
      });
    });
    it('gives allowed actions by state and role, none to a role that cannot manage', async () => {
      const u = await unitIn();
      const asRole = async (role) =>
        (await new GetUnit(t.deps).execute({ actor: actor(role), id: u.id })).allowedActions;
      expect(await asRole('owner')).toEqual(['hold', 'block']);
      expect(await asRole('inventory_manager')).toEqual(['hold', 'block']);
      expect(await asRole('sales_agent')).toEqual([]);
      expect(await asRole('auditor')).toEqual([]);
    });
    it('holds, releases, blocks and unblocks with history, audit and announcements', async () => {
      const u = await unitIn();
      const run = (action) => new ActOnUnit(t.deps).execute({ actor: owner, id: u.id, action });
      expect((await run('hold')).status).toBe('held');
      expect((await run('release')).status).toBe('available');
      expect((await run('block')).status).toBe('blocked');
      await expect(run('hold')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      expect((await run('unblock')).status).toBe('available');
      expect((await t.repos.unitHistory.list(u.id)).map((h) => h.status)).toEqual([
        'available',
        'held',
        'available',
        'blocked',
        'available',
      ]);
      expect(
        t.auditEntries
          .filter((a) => a.action.startsWith('unit.') && a.action !== 'unit.create')
          .map((a) => a.action),
      ).toEqual(['unit.hold', 'unit.release', 'unit.block', 'unit.unblock']);
      await expect(
        new ActOnUnit(t.deps).execute({ actor: owner, id: u.id, action: 'sell' }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });
    const photo = { filename: 'Living Room.JPG', contentType: 'image/jpeg', size: 2048 };
    const addPicture = async (unitId, kind = 'image', over = {}) => {
      const { assetId } = await new RequestUnitMediaUpload(t.deps).execute({
        actor: owner,
        unitId,
        kind,
        ...photo,
        ...over,
      });
      putFile(t, assetId);
      return new AddUnitMedia(t.deps).execute({
        actor: owner,
        unitId,
        kind,
        assetId,
        caption: 'Living',
      });
    };
    it('keeps pictures for flats, shops and villas, not plots, in order', async () => {
      const plot = await unitIn();
      const flat = await unitIn({ unitNo: 'T-1', kind: 'flat' });
      await expect(
        new RequestUnitMediaUpload(t.deps).execute({
          actor: owner,
          unitId: plot.id,
          kind: 'image',
          ...photo,
        }),
      ).rejects.toMatchObject({ code: 'NO_MEDIA_ON_PLOTS' });
      const a = await addPicture(flat.id);
      const b = await addPicture(flat.id, 'floor_plan');
      expect([a.sortOrder, b.sortOrder]).toEqual([0, 1]);
      expect(a.asset).toMatchObject({ status: 'ready', storedName: 'living-room.jpg' });
      expect((await new GetUnit(t.deps).execute({ actor: owner, id: flat.id })).media).toHaveLength(
        2,
      );
      const key = t.files.objectKey(a.asset);
      expect(await t.files.storage.head(key)).not.toBeNull();
      await new RemoveUnitMedia(t.deps).execute({ actor: owner, unitId: flat.id, mediaId: a.id });
      expect(await t.files.storage.head(key)).toBeNull();
      expect(t.stores.files.get(a.asset.id).status).toBe('deleted');
      await expect(
        new RemoveUnitMedia(t.deps).execute({ actor: owner, unitId: flat.id, mediaId: a.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('refuses bad uploads and unconfirmed or reused ones', async () => {
      const flat = await unitIn({ unitNo: 'T-2', kind: 'flat' });
      const ask = (over) =>
        new RequestUnitMediaUpload(t.deps).execute({
          actor: owner,
          unitId: flat.id,
          kind: 'image',
          ...photo,
          ...over,
        });
      await expect(ask({ contentType: 'application/pdf' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(ask({ size: 50 * 1024 * 1024 })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(ask({ kind: 'video' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const add = (assetId, over = {}) =>
        new AddUnitMedia(t.deps).execute({
          actor: owner,
          unitId: flat.id,
          kind: 'image',
          assetId,
          ...over,
        });
      const first = await ask({});
      await expect(add(first.assetId)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' }); // not uploaded
      putFile(t, first.assetId, { size: 1 });
      await expect(add(first.assetId)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' }); // wrong size
      putFile(t, first.assetId);
      await add(first.assetId);
      await expect(add(first.assetId)).rejects.toMatchObject({ code: 'UPLOAD_ALREADY_USED' });
      await expect(add(uuid(9))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(add('not-a-uuid')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const other = await unitIn({ unitNo: 'T-3', kind: 'flat' });
      const forOther = await new RequestUnitMediaUpload(t.deps).execute({
        actor: owner,
        unitId: other.id,
        kind: 'image',
        ...photo,
      });
      putFile(t, forOther.assetId);
      await expect(add(forOther.assetId)).rejects.toMatchObject({ code: 'NOT_FOUND' }); // another unit's upload
    });
    it('uploads a project site map and replaces the previous one', async () => {
      const map = { filename: 'plan.png', contentType: 'image/png', size: 4096 };
      const get = () => new GetProjectMap(t.deps).execute({ actor: owner, id: project.id });
      expect((await get()).mapAsset).toBeNull();
      const one = await new RequestProjectMapUpload(t.deps).execute({
        actor: owner,
        projectId: project.id,
        ...map,
      });
      putFile(t, one.assetId);
      await new ConfirmProjectMap(t.deps).execute({
        actor: owner,
        projectId: project.id,
        assetId: one.assetId,
      });
      expect((await get()).mapAsset.id).toBe(one.assetId);
      const two = await new RequestProjectMapUpload(t.deps).execute({
        actor: owner,
        projectId: project.id,
        ...map,
        filename: 'plan2.png',
      });
      putFile(t, two.assetId);
      const oldKey = t.files.objectKey(t.stores.files.get(one.assetId));
      await new ConfirmProjectMap(t.deps).execute({
        actor: owner,
        projectId: project.id,
        assetId: two.assetId,
      });
      expect((await get()).mapAsset.id).toBe(two.assetId);
      expect(await t.files.storage.head(oldKey)).toBeNull();
      await expect(
        new RequestProjectMapUpload(t.deps).execute({ actor: owner, projectId: uuid(5), ...map }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new ConfirmProjectMap(t.deps).execute({
          actor: owner,
          projectId: project.id,
          assetId: uuid(6),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new RequestProjectMapUpload(t.deps).execute({
          actor: actor('sales_agent'),
          projectId: project.id,
          ...map,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('needs the right permission for every operation', async () => {
      const u = await unitIn();
      const agent = actor('sales_agent');
      const denied = [
        () => new CreateProject(t.deps).execute({ actor: agent, name: 'X', kind: 'tower' }),
        () => new UpdateProject(t.deps).execute({ actor: agent, id: project.id, patch: {} }),
        () => new DeleteProject(t.deps).execute({ actor: agent, id: project.id }),
        () => new LayoutProject(t.deps).execute({ actor: agent, id: project.id }),
        () => new CreatePhase(t.deps).execute({ actor: agent, projectId: project.id, name: 'x' }),
        () =>
          new CreateUnit(t.deps).execute({
            actor: agent,
            projectId: project.id,
            fields: UNIT_FIELDS,
          }),
        () => new UpdateUnit(t.deps).execute({ actor: agent, id: u.id, fields: {} }),
        () => new DeleteUnit(t.deps).execute({ actor: agent, id: u.id }),
        () => new ActOnUnit(t.deps).execute({ actor: agent, id: u.id, action: 'block' }),
        () =>
          new AddUnitMedia(t.deps).execute({
            actor: agent,
            unitId: u.id,
            kind: 'image',
            assetId: uuid(1),
          }),
        () =>
          new RequestUnitMediaUpload(t.deps).execute({
            actor: agent,
            unitId: u.id,
            kind: 'image',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            size: 1,
          }),
      ];
      for (const run of denied) await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const noView = actor('dealer_manager');
      for (const run of [
        () => new ListProjects(t.deps).execute({ actor: noView }),
        () => new GetProjectMap(t.deps).execute({ actor: noView, id: project.id }),
        () => new ListUnits(t.deps).execute({ actor: noView }),
        () => new GetUnit(t.deps).execute({ actor: noView, id: u.id }),
      ])
        await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('hides another tenant’s unit from every operation', async () => {
      const u = await unitIn();
      const stranger = actor('owner', { tenantId: TEST_TENANT_B });
      for (const run of [
        () => new GetUnit(t.deps).execute({ actor: stranger, id: u.id }),
        () => new UpdateUnit(t.deps).execute({ actor: stranger, id: u.id, fields: {} }),
        () => new ActOnUnit(t.deps).execute({ actor: stranger, id: u.id, action: 'block' }),
        () => new DeleteUnit(t.deps).execute({ actor: stranger, id: u.id }),
      ])
        await expect(run()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('booking saga consumers', () => {
    it('reserves an available unit, writing history, audit and both events', async () => {
      const u = await unitIn();
      const result = await new ReserveUnit(t.deps).execute(
        booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id),
      );
      expect(result.duplicate).toBe(false);
      expect(t.stores.units.get(u.id)).toMatchObject({
        status: 'booked',
        bookingId: uuid(1),
        everBooked: true,
      });
      expect(eventsOfType(t.events, 'unit.booked')[0].data).toEqual({
        booking_id: uuid(1),
        unit_id: u.id,
      });
      expect(eventsOfType(t.events, 'unit.upserted').at(-1).data.status).toBe('booked');
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'unit.book',
        after: { status: 'booked', bookingId: uuid(1) },
      });
      expect((await t.repos.unitHistory.list(u.id)).at(-1)).toMatchObject({
        status: 'booked',
        changedByName: 'Sales',
      });
    });
    it('reserves a held unit too', async () => {
      const u = await unitIn();
      await new ActOnUnit(t.deps).execute({ actor: owner, id: u.id, action: 'hold' });
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id));
      expect(t.stores.units.get(u.id).status).toBe('booked');
    });
    it.each([
      ['blocked', 'block'],
      ['booked', null],
    ])('rejects the booking when the unit is %s', async (status, action) => {
      const u = await unitIn();
      if (action) await new ActOnUnit(t.deps).execute({ actor: owner, id: u.id, action });
      else await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id));
      const before = t.events.length;
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(2), u.id));
      const rejected = eventsOfType(t.events.slice(before), 'unit.booking_rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].data).toMatchObject({
        booking_id: uuid(2),
        reason: `The unit is ${status}`,
      });
      expect(t.stores.units.get(u.id).bookingId).not.toBe(uuid(2));
    });
    it('rejects the booking when the unit does not exist', async () => {
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), uuid(404)));
      expect(eventsOfType(t.events, 'unit.booking_rejected')[0].data.reason).toMatch(
        /no longer exists/,
      );
    });
    it('does nothing the second time an event arrives', async () => {
      const u = await unitIn();
      const event = booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id);
      await new ReserveUnit(t.deps).execute(event);
      const events = t.events.length;
      const again = await new ReserveUnit(t.deps).execute(event);
      expect(again.duplicate).toBe(true);
      expect(t.events).toHaveLength(events);
    });
    it('does not let another tenant’s event touch the unit', async () => {
      const u = await unitIn();
      await new ReserveUnit(t.deps).execute(
        booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id, TEST_TENANT_B),
      );
      expect(t.stores.units.get(u.id).status).toBe('available');
      expect(eventsOfType(t.events, 'unit.booking_rejected')).toHaveLength(1);
    });
    it('sells the unit when the booking completes and frees it when cancelled', async () => {
      const a = await unitIn();
      const b = await unitIn({ unitNo: 'A-02' });
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), a.id));
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(2), b.id));
      await new FollowBooking({ ...t.deps, mode: 'sell' }).execute(
        booking(EVENT.BOOKING_COMPLETED, uuid(1), a.id),
      );
      await new FollowBooking({ ...t.deps, mode: 'release' }).execute(
        booking(EVENT.BOOKING_CANCELLED, uuid(2), b.id),
      );
      expect(t.stores.units.get(a.id)).toMatchObject({ status: 'sold', bookingId: uuid(1) });
      expect(t.stores.units.get(b.id)).toMatchObject({
        status: 'available',
        bookingId: null,
        everBooked: true,
      });
    });
    it('ignores a completion or cancellation from the wrong booking, an unknown unit, or a repeat', async () => {
      const u = await unitIn();
      await new ReserveUnit(t.deps).execute(booking(EVENT.BOOKING_REQUESTED, uuid(1), u.id));
      const sell = (bookingId, unitId = u.id) =>
        new FollowBooking({ ...t.deps, mode: 'sell' }).execute(
          booking(EVENT.BOOKING_COMPLETED, bookingId, unitId),
        );
      await sell(uuid(2));
      await sell(uuid(1), uuid(404));
      expect(t.stores.units.get(u.id).status).toBe('booked');
      await sell(uuid(1));
      await sell(uuid(1)); // new event id, unit already sold: still fine
      expect(t.stores.units.get(u.id).status).toBe('sold');
      expect(() => new FollowBooking({ ...t.deps, mode: 'bogus' })).toThrow(/Unknown mode/);
    });
  });

  describe('tenant events', () => {
    const tenantEvent = (currency, at) => ({
      ...buildEvent({
        type: EVENT.TENANT_UPSERTED,
        tenantId: TEST_TENANT_B,
        producer: 'identity',
        data: {
          slug: 'ae',
          name: 'Desert Rose',
          currency,
          locale: 'en-AE',
          time_zone: 'Asia/Dubai',
          area_unit: 'sq_ft',
        },
      }),
      occurred_at: at,
    });
    it('keeps the latest snapshot even when events arrive out of order', async () => {
      await new ApplyTenant(t.deps).execute(tenantEvent('AED', '2026-10-21T10:00:00.000Z'));
      await new ApplyTenant(t.deps).execute(tenantEvent('USD', '2026-10-21T09:00:00.000Z'));
      expect((await t.repos.tenantRefs.get(TEST_TENANT_B)).currency).toBe('AED');
    });
  });
});
