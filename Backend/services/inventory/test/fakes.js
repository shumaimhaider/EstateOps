import {
  ConflictError,
  NotFoundError,
  DEFAULT_ROLE_PERMISSIONS,
  clampLimit,
  decodeCursor,
  encodeCursor,
  parseSort,
} from '@estateops/kernel';
import { createFakeUow, createTestAuth, TEST_TENANT_A } from '@estateops/platform/testing';
import { silentLogger } from '@estateops/platform';
import { composeInventory } from '../src/main/compose.js';
import { UNIT_SORT_FIELDS } from '../src/units/application/ListUnits.js';

const STATUSES = ['available', 'held', 'booked', 'sold', 'blocked'];
const ci = (s) => String(s).toLowerCase();

/** Offset-based paging is fine in a fake: tests only need the page contract, not keyset SQL. */
function pageOf(rows, cursor, limit) {
  const size = clampLimit(limit);
  const start = cursor ? decodeCursor(cursor).v : 0;
  const slice = rows.slice(start, start + size);
  const next = start + size < rows.length ? encodeCursor({ v: start + size, id: 'o' }) : null;
  return { items: slice, nextCursor: next };
}

/** In-memory inventory repositories that enforce the same uniqueness and version rules as SQL. */
export function makeInventoryRepos() {
  const s = {
    projects: new Map(),
    phases: new Map(),
    blocks: new Map(),
    floors: new Map(),
    units: new Map(),
    history: [],
    media: [],
    tenantRefs: new Map(),
  };
  const clone = (x) => (x ? structuredClone(x) : null);
  const bump = (row) => ({ ...row, version: row.version + 1 });
  const inTenant = (map, tenantId) => [...map.values()].filter((r) => r.tenantId === tenantId);

  const repos = {
    projects: {
      insert: async (p) => {
        if (inTenant(s.projects, p.tenantId).some((x) => ci(x.name) === ci(p.name)))
          throw new ConflictError('PROJECT_NAME_TAKEN', 'taken');
        s.projects.set(p.id, {
          ...p,
          createdAt: new Date('2026-10-21T09:00:00Z'),
          updatedAt: new Date('2026-10-21T09:00:00Z'),
        });
        return p;
      },
      findById: async (tenantId, id) => {
        const p = s.projects.get(id);
        return p && p.tenantId === tenantId ? clone(p) : null;
      },
      findByName: async (tenantId, name) =>
        clone(inTenant(s.projects, tenantId).find((x) => ci(x.name) === ci(name))),
      update: async (p) => {
        const cur = s.projects.get(p.id);
        if (!cur) throw new NotFoundError();
        if (cur.version !== p.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
        const saved = bump({ ...cur, ...p });
        s.projects.set(p.id, saved);
        return clone(saved);
      },
      delete: async (_t, id) => void s.projects.delete(id),
      childCounts: async (tenantId, id) => ({
        units: inTenant(s.units, tenantId).filter((u) => u.projectId === id).length,
        phases: inTenant(s.phases, tenantId).filter((x) => x.projectId === id).length,
        blocks: inTenant(s.blocks, tenantId).filter((x) => x.projectId === id).length,
      }),
      findWithCounts: async (tenantId, id) => {
        const project = await repos.projects.findById(tenantId, id);
        if (!project) return null;
        const counts = Object.fromEntries(
          STATUSES.map((st) => [
            st,
            inTenant(s.units, tenantId).filter((u) => u.projectId === id && u.status === st).length,
          ]),
        );
        return {
          project,
          unitCounts: counts,
          unitsTotal: Object.values(counts).reduce((a, b) => a + b, 0),
        };
      },
      list: async (tenantId, { cursor, limit }) => {
        const rows = inTenant(s.projects, tenantId).sort((a, b) =>
          ci(a.name).localeCompare(ci(b.name)),
        );
        const page = pageOf(rows, cursor, limit);
        const items = [];
        for (const p of page.items) items.push(await repos.projects.findWithCounts(tenantId, p.id));
        return { items, nextCursor: page.nextCursor };
      },
    },
    structure: {
      insertPhase: async (p) => (s.phases.set(p.id, { ...p }), p),
      findPhase: async (t, id) =>
        s.phases.get(id)?.tenantId === t ? clone(s.phases.get(id)) : null,
      phaseNameTaken: async (projectId, name) =>
        [...s.phases.values()].some((x) => x.projectId === projectId && ci(x.name) === ci(name)),
      phaseInUse: async (t, id) =>
        inTenant(s.blocks, t).some((b) => b.phaseId === id) ||
        inTenant(s.units, t).some((u) => u.phaseId === id),
      deletePhase: async (_t, id) => void s.phases.delete(id),
      listPhases: async (t, projectId) =>
        inTenant(s.phases, t)
          .filter((x) => x.projectId === projectId)
          .map(clone),
      insertBlock: async (b) => (s.blocks.set(b.id, { ...b }), b),
      findBlock: async (t, id) =>
        s.blocks.get(id)?.tenantId === t ? clone(s.blocks.get(id)) : null,
      blockNameTaken: async (projectId, name) =>
        [...s.blocks.values()].some((x) => x.projectId === projectId && ci(x.name) === ci(name)),
      blockInUse: async (t, id) =>
        inTenant(s.floors, t).some((f) => f.blockId === id) ||
        inTenant(s.units, t).some((u) => u.blockId === id),
      updateBlock: async (b) => (s.blocks.set(b.id, { ...s.blocks.get(b.id), ...b }), b),
      deleteBlock: async (_t, id) => void s.blocks.delete(id),
      listBlocks: async (t, projectId) =>
        inTenant(s.blocks, t)
          .filter((x) => x.projectId === projectId)
          .map(clone),
      saveBlockGeometry: async (_t, items) =>
        items.forEach(({ blockId, geometry }) => (s.blocks.get(blockId).geometry = geometry)),
      insertFloor: async (f) => (s.floors.set(f.id, { ...f }), f),
      findFloor: async (t, id) =>
        s.floors.get(id)?.tenantId === t ? clone(s.floors.get(id)) : null,
      floorNumberTaken: async (blockId, number) =>
        [...s.floors.values()].some((x) => x.blockId === blockId && x.number === number),
      floorInUse: async (t, id) => inTenant(s.units, t).some((u) => u.floorId === id),
      deleteFloor: async (_t, id) => void s.floors.delete(id),
      listFloorsOfProject: async (t, projectId) => {
        const blockIds = new Set(
          inTenant(s.blocks, t)
            .filter((b) => b.projectId === projectId)
            .map((b) => b.id),
        );
        return inTenant(s.floors, t)
          .filter((f) => blockIds.has(f.blockId))
          .map(clone);
      },
    },
    units: {
      insert: async (u) => {
        if (
          inTenant(s.units, u.tenantId).some(
            (x) => x.projectId === u.projectId && ci(x.unitNo) === ci(u.unitNo),
          )
        )
          throw new ConflictError('UNIT_NO_TAKEN', 'taken');
        s.units.set(u.id, {
          ...u,
          createdAt: new Date('2026-10-21T09:00:00Z'),
          updatedAt: new Date('2026-10-21T09:00:00Z'),
        });
        return u;
      },
      findById: async (t, id) => (s.units.get(id)?.tenantId === t ? clone(s.units.get(id)) : null),
      findDetail: async (t, id) => {
        const unit = await repos.units.findById(t, id);
        if (!unit) return null;
        return {
          unit,
          projectName: s.projects.get(unit.projectId)?.name ?? '',
          blockName: s.blocks.get(unit.blockId)?.name ?? null,
          floorLabel: s.floors.get(unit.floorId)?.label ?? null,
        };
      },
      unitNoTaken: async (t, projectId, unitNo) =>
        inTenant(s.units, t).some((x) => x.projectId === projectId && ci(x.unitNo) === ci(unitNo)),
      update: async (u) => {
        const cur = s.units.get(u.id);
        if (!cur) throw new NotFoundError();
        if (cur.version !== u.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
        if (
          inTenant(s.units, u.tenantId).some(
            (x) => x.id !== u.id && x.projectId === u.projectId && ci(x.unitNo) === ci(u.unitNo),
          )
        )
          throw new ConflictError('UNIT_NO_TAKEN', 'taken');
        const saved = bump({ ...cur, ...u });
        s.units.set(u.id, saved);
        return clone(saved);
      },
      delete: async (_t, id) => {
        s.units.delete(id);
        s.history = s.history.filter((h) => h.unitId !== id);
        s.media = s.media.filter((m) => m.unitId !== id);
      },
      list: async (t, { q, status, kind, projectId, sort, cursor, limit }) => {
        const picked = parseSort(sort, UNIT_SORT_FIELDS, { field: 'unit_no', dir: 'asc' });
        const key = {
          unit_no: 'unitNo',
          area_value: 'areaValue',
          list_price: 'listPrice',
          status: 'status',
        }[picked.field];
        let rows = inTenant(s.units, t).filter(
          (u) =>
            (!status || u.status === status) &&
            (!kind || u.kind === kind) &&
            (!projectId || u.projectId === projectId),
        );
        if (q?.trim())
          rows = rows.filter((u) =>
            `${u.unitNo} ${s.projects.get(u.projectId)?.name} ${s.blocks.get(u.blockId)?.name ?? ''}`
              .toLowerCase()
              .includes(q.trim().toLowerCase()),
          );
        rows.sort(
          (a, b) =>
            (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id.localeCompare(b.id)) *
            (picked.dir === 'desc' ? -1 : 1),
        );
        const page = pageOf(rows, cursor, limit);
        return {
          ...page,
          items: await Promise.all(page.items.map((u) => repos.units.findDetail(t, u.id))),
        };
      },
      listShapes: async (t, projectId) =>
        inTenant(s.units, t)
          .filter((u) => u.projectId === projectId && u.geometry)
          .map((u) => ({
            unitId: u.id,
            unitNo: u.unitNo,
            blockId: u.blockId,
            kind: u.kind,
            status: u.status,
            ...u.geometry,
          })),
      listForLayout: async (t, projectId) =>
        inTenant(s.units, t)
          .filter((u) => u.projectId === projectId)
          .map((u) => ({ id: u.id, blockId: u.blockId, floorId: u.floorId, unitNo: u.unitNo })),
      saveGeometry: async (_t, items) =>
        items.forEach(({ unitId, geometry }) => (s.units.get(unitId).geometry = geometry)),
    },
    unitHistory: {
      add: async (h) => void s.history.push({ ...h, changedAt: new Date('2026-10-21T09:00:00Z') }),
      list: async (unitId) => s.history.filter((h) => h.unitId === unitId),
    },
    unitMedia: {
      add: async (m) => void s.media.push({ ...m }),
      list: async (unitId) => s.media.filter((m) => m.unitId === unitId),
      remove: async (_t, unitId, mediaId) => {
        const before = s.media.length;
        s.media = s.media.filter((m) => !(m.unitId === unitId && m.id === mediaId));
        return s.media.length < before;
      },
    },
    tenantRefs: {
      get: async (t) => s.tenantRefs.get(t) ?? null,
      upsert: async (ref, sourceAt) => {
        const cur = s.tenantRefs.get(ref.tenantId);
        if (cur && cur.sourceAt > sourceAt) return false;
        s.tenantRefs.set(ref.tenantId, { ...ref, sourceAt });
        return true;
      },
    },
  };
  return { stores: s, repos };
}

export const fixedNow = () => new Date('2026-10-21T09:00:00.000Z');
export const clock = { now: fixedNow };

/** Wires the whole inventory service over fakes. The tenant starts with a PKR currency copy. */
export async function buildInventoryTest({ seedTenant = true } = {}) {
  const memory = makeInventoryRepos();
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  if (seedTenant) {
    memory.stores.tenantRefs.set(TEST_TENANT_A, {
      tenantId: TEST_TENANT_A,
      slug: 'pk',
      name: 'Zameen',
      currency: 'PKR',
      locale: 'en-PK',
      timeZone: 'Asia/Karachi',
      areaUnit: 'marla',
      sourceAt: '2026-10-20T00:00:00.000Z',
    });
  }
  const deps = {
    uow: fake.uow,
    clock,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
  };
  return { ...memory, ...fake, auth, deps, app: composeInventory(deps) };
}

export const actor = (role = 'owner', over = {}) => ({
  tenantId: TEST_TENANT_A,
  userId: '00000000-0000-4000-8000-00000000u001'.replace('u', '0'),
  name: 'Test User',
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  ...over,
});

export const UNIT_FIELDS = {
  unitNo: 'A-01',
  kind: 'plot',
  areaValue: 5,
  areaUnit: 'marla',
  bedrooms: null,
  facing: 'North',
  view: null,
  corner: false,
  parking: 1,
  listPrice: 15_000_000_00,
  currency: 'PKR',
};
