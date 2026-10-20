import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { MockApiError } from './errors.js';
import { unitMedia } from './mediaArt.js';
import { compareValues, paginate, parseSort } from './pagination.js';
import { allowedActions, transition } from './stateMachines.js';

const KINDS = ['plot', 'flat', 'villa', 'shop'];
const AREA_UNITS = ['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m'];
const SORTABLE = ['unit_no', 'area_value', 'list_price', 'status'];

const tenantRows = (rows, ctx) => rows.filter((r) => r.tenant_id === ctx.tenant.id);

/** Row -> wire DTO. Joins display names; `allowed_actions` come from the state machine. */
export function toUnitDto(db, row, ctx, { detail = false } = {}) {
  const { status_history: history, ...rest } = row;
  const project = db.projects.find((p) => p.id === row.project_id);
  const block = db.blocks.find((b) => b.id === row.block_id);
  const floor = db.floors.find((f) => f.id === row.floor_id);
  return {
    ...rest,
    project_name: project?.name ?? '',
    block_name: block?.name ?? null,
    floor_label: floor?.label ?? null,
    phase_id: row.phase_id ?? null,
    block_id: row.block_id ?? null,
    floor_id: row.floor_id ?? null,
    allowed_actions: allowedActions('unit', row, ctx.user),
    booking_id: row.booking_id ?? null,
    ...(detail ? { status_history: history, media: unitMedia(row) } : {}),
  };
}

export function listUnits(db, ctx, params) {
  const { q, status, kind, project_id: projectId, cursor, limit } = params;
  const sort = parseSort(params.sort, SORTABLE, null);
  const needle = q?.trim().toLowerCase();

  let rows = tenantRows(db.units, ctx).filter(
    (u) =>
      (!status || u.status === status) &&
      (!kind || u.kind === kind) &&
      (!projectId || u.project_id === projectId),
  );
  if (needle) {
    rows = rows.filter((u) => {
      const project = db.projects.find((p) => p.id === u.project_id)?.name ?? '';
      const block = db.blocks.find((b) => b.id === u.block_id)?.name ?? '';
      return `${u.unit_no} ${project} ${block}`.toLowerCase().includes(needle);
    });
  }
  rows = [...rows].sort((a, b) => {
    if (sort) {
      const c = compareValues(a[sort.field], b[sort.field]) * (sort.dir === 'desc' ? -1 : 1);
      if (c !== 0) return c;
    } else {
      const c = compareValues(a.project_id, b.project_id) || compareValues(a.unit_no, b.unit_no);
      if (c !== 0) return c;
    }
    return compareValues(a.id, b.id);
  });

  const page = paginate(rows, { cursor, limit });
  return {
    items: page.items.map((r) => toUnitDto(db, r, ctx)),
    cursors: page.cursors,
    nextCursor: page.nextCursor,
  };
}

function findUnit(db, ctx, id) {
  const row = tenantRows(db.units, ctx).find((u) => u.id === id);
  if (!row) throw new MockApiError(404, 'NOT_FOUND', 'Unit not found');
  return row;
}

export function getUnit(db, ctx, id) {
  return toUnitDto(db, findUnit(db, ctx, id), ctx, { detail: true });
}

function validateCreate(db, ctx, body) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const project = tenantRows(db.projects, ctx).find((p) => p.id === body.project_id);
  if (!project) add('project_id', 'Choose a project from this tenant');
  const unitNo = String(body.unit_no ?? '').trim();
  if (!unitNo) add('unit_no', 'Unit number is required');
  else if (
    project &&
    db.units.some(
      (u) => u.project_id === project.id && u.unit_no.toLowerCase() === unitNo.toLowerCase(),
    )
  ) {
    add('unit_no', 'Unit number already exists in this project');
  }
  if (!KINDS.includes(body.kind)) add('kind', 'Unknown unit kind');
  if (!AREA_UNITS.includes(body.area_unit)) add('area_unit', 'Unknown area unit');
  if (!(Number(body.area_value) > 0)) add('area_value', 'Area must be greater than zero');
  if (!Number.isInteger(body.list_price) || body.list_price < 0) {
    add('list_price', 'Price must be a non-negative whole number of minor units');
  }
  if (body.currency !== ctx.tenant.currency) {
    add('list_price', `Price must be in ${ctx.tenant.currency}`);
  }
  if (errors.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The unit could not be saved', errors);
  }
  return { project, unitNo };
}

export function createUnit(db, ctx, body) {
  const { project, unitNo } = validateCreate(db, ctx, body);
  const at = nowIso(db.clock);
  const row = {
    id: globalThis.crypto.randomUUID(),
    tenant_id: ctx.tenant.id,
    project_id: project.id,
    phase_id: null,
    block_id: null,
    floor_id: null,
    unit_no: unitNo,
    kind: body.kind,
    area_value: Number(body.area_value),
    area_unit: body.area_unit,
    bedrooms: body.bedrooms ?? null,
    facing: body.facing ?? null,
    view: body.view ?? null,
    corner: Boolean(body.corner),
    parking: body.parking ?? 0,
    attributes: {},
    status: 'available',
    list_price: body.list_price,
    currency: body.currency,
    geometry: null,
    booking_id: null,
    status_history: [
      {
        status: 'available',
        changed_by: ctx.user.id,
        changed_by_name: ctx.user.name,
        changed_at: at,
      },
    ],
    created_at: at,
    updated_at: at,
    created_by: ctx.user.id,
  };
  db.units.push(row);
  appendAudit(db, {
    actor: ctx.user,
    action: 'unit.create',
    subjectType: 'unit',
    subjectId: row.id,
    after: { unit_no: row.unit_no, status: row.status },
  });
  return toUnitDto(db, row, ctx, { detail: true });
}

/** Staff status action (block / unblock). Rejects anything the state machine does not list. */
export function actOnUnit(db, ctx, id, action) {
  const row = findUnit(db, ctx, id);
  if (!allowedActions('unit', row, ctx.user).includes(action)) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot ${action} a unit that is ${row.status}`,
    );
  }
  const before = { status: row.status };
  const next = transition('unit', row.status, action);
  const at = nowIso(db.clock);
  row.status = next;
  row.updated_at = at;
  row.status_history.push({
    status: next,
    changed_by: ctx.user.id,
    changed_by_name: ctx.user.name,
    changed_at: at,
  });
  appendAudit(db, {
    actor: ctx.user,
    action: `unit.${action}`,
    subjectType: 'unit',
    subjectId: row.id,
    before,
    after: { status: next },
  });
  return toUnitDto(db, row, ctx, { detail: true });
}
