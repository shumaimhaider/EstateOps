import { MAP_HEIGHT, MAP_WIDTH } from '../db/layout.js';
import { MockApiError } from './errors.js';
import { compareValues, paginate } from './pagination.js';

const STATUSES = ['available', 'held', 'booked', 'sold', 'blocked'];

export function toProjectDto(db, row) {
  const units = db.units.filter((u) => u.project_id === row.id);
  const unitCounts = Object.fromEntries(
    STATUSES.map((s) => [s, units.filter((u) => u.status === s).length]),
  );
  return {
    ...row,
    units_total: units.length,
    unit_counts: unitCounts,
    allowed_actions: [],
  };
}

export function listProjects(db, ctx, { cursor, limit }) {
  const rows = db.projects
    .filter((p) => p.tenant_id === ctx.tenant.id)
    .sort((a, b) => compareValues(a.name, b.name));
  const page = paginate(rows, { cursor, limit });
  return {
    items: page.items.map((p) => toProjectDto(db, p)),
    cursors: page.cursors,
    nextCursor: page.nextCursor,
  };
}

function findProject(db, ctx, id) {
  const row = db.projects.find((p) => p.id === id && p.tenant_id === ctx.tenant.id);
  if (!row) throw new MockApiError(404, 'NOT_FOUND', 'Project not found');
  return row;
}

export const getProject = (db, ctx, id) => toProjectDto(db, findProject(db, ctx, id));

/** Site plan: block outlines plus one coloured-by-status shape per unit. */
export function projectMap(db, ctx, id) {
  const project = findProject(db, ctx, id);
  return {
    project_id: project.id,
    project_name: project.name,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    blocks: db.blocks
      .filter((b) => b.project_id === project.id)
      .map((b) => ({ id: b.id, name: b.name, kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h })),
    shapes: db.units
      .filter((u) => u.project_id === project.id && u.geometry)
      .map((u) => ({
        unit_id: u.id,
        unit_no: u.unit_no,
        block_id: u.block_id,
        kind: u.kind,
        status: u.status,
        x: u.geometry.x,
        y: u.geometry.y,
        w: u.geometry.w,
        h: u.geometry.h,
      })),
  };
}
