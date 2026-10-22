import { ConflictError, parseSort } from '@estateops/kernel';
import { createQuery, keysetSql, likeContains, pgCode, updateVersioned } from '@estateops/platform';
import { UNIT_SORT_FIELDS } from '../application/ListUnits.js';
import { UnitRow } from './entities.js';

const num = (v) => (v === null || v === undefined ? v : Number(v));

export const toUnit = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  phaseId: r.phase_id,
  blockId: r.block_id,
  floorId: r.floor_id,
  unitNo: r.unit_no,
  kind: r.kind,
  areaValue: num(r.area_value),
  areaUnit: r.area_unit,
  bedrooms: r.bedrooms,
  facing: r.facing,
  view: r.view,
  corner: r.corner,
  parking: r.parking,
  attributes: r.attributes ?? {},
  status: r.status,
  listPrice: num(r.list_price),
  currency: r.currency,
  geometry: r.geometry,
  bookingId: r.booking_id,
  everBooked: r.ever_booked,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});

const SORTS = {
  unit_no: { expr: 'u.unit_no', cast: 'text', pick: (r) => r.unit_no },
  area_value: { expr: 'u.area_value', cast: 'numeric', pick: (r) => r.area_value },
  list_price: { expr: 'u.list_price', cast: 'bigint', pick: (r) => r.list_price },
  status: { expr: 'u.status', cast: 'text', pick: (r) => r.status },
};

const VIEW_SQL = `FROM inventory.unit u
  JOIN inventory.project p ON p.id = u.project_id
  LEFT JOIN inventory.block b ON b.id = u.block_id
  LEFT JOIN inventory.floor f ON f.id = u.floor_id`;
const VIEW_COLUMNS = 'u.*, p.name AS project_name, b.name AS block_name, f.label AS floor_label';

const toView = (r) => ({
  unit: toUnit(r),
  projectName: r.project_name,
  blockName: r.block_name,
  floorLabel: r.floor_label,
});

export class UnitRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(UnitRow);
  }

  async insert(unit) {
    try {
      await this.repo.insert({
        id: unit.id,
        tenant_id: unit.tenantId,
        project_id: unit.projectId,
        phase_id: unit.phaseId,
        block_id: unit.blockId,
        floor_id: unit.floorId,
        unit_no: unit.unitNo,
        kind: unit.kind,
        area_value: unit.areaValue,
        area_unit: unit.areaUnit,
        bedrooms: unit.bedrooms,
        facing: unit.facing,
        view: unit.view,
        corner: unit.corner,
        parking: unit.parking,
        attributes: unit.attributes,
        status: unit.status,
        list_price: unit.listPrice,
        currency: unit.currency,
        geometry: unit.geometry,
        booking_id: unit.bookingId,
        ever_booked: unit.everBooked,
        created_by: unit.createdBy,
      });
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError('UNIT_NO_TAKEN', 'Unit number already exists in this project');
      throw error;
    }
    return unit;
  }

  /** `lock: true` takes a row lock (FOR UPDATE) for the rest of the transaction. */
  async findById(tenantId, id, { lock = false } = {}) {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.id = :id AND u.tenant_id = :tenantId', { id, tenantId });
    if (lock) qb.setLock('pessimistic_write');
    const row = await qb.getOne();
    return row ? toUnit(row) : null;
  }

  async findDetail(tenantId, id) {
    const rows = await this.manager.query(
      `SELECT ${VIEW_COLUMNS} ${VIEW_SQL} WHERE u.tenant_id = $1 AND u.id = $2`,
      [tenantId, id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async unitNoTaken(tenantId, projectId, unitNo) {
    const rows = await this.manager.query(
      'SELECT 1 FROM inventory.unit WHERE tenant_id = $1 AND project_id = $2 AND lower(unit_no) = lower($3) LIMIT 1',
      [tenantId, projectId, unitNo],
    );
    return rows.length > 0;
  }

  async update(unit) {
    const version = await updateVersioned(this.manager, UnitRow, {
      where: { id: unit.id, tenant_id: unit.tenantId },
      version: unit.version,
      set: {
        unit_no: unit.unitNo,
        kind: unit.kind,
        area_value: unit.areaValue,
        area_unit: unit.areaUnit,
        bedrooms: unit.bedrooms,
        facing: unit.facing,
        view: unit.view,
        corner: unit.corner,
        parking: unit.parking,
        status: unit.status,
        list_price: unit.listPrice,
        booking_id: unit.bookingId,
        ever_booked: unit.everBooked,
      },
    }).catch((error) => {
      if (pgCode(error) === '23505')
        throw new ConflictError('UNIT_NO_TAKEN', 'Unit number already exists in this project');
      throw error;
    });
    return { ...unit, version };
  }

  async delete(tenantId, id) {
    await this.manager.query(
      'DELETE FROM inventory.unit_media WHERE tenant_id = $1 AND unit_id = $2',
      [tenantId, id],
    );
    await this.manager.query(
      'DELETE FROM inventory.unit_status_history WHERE tenant_id = $1 AND unit_id = $2',
      [tenantId, id],
    );
    await this.repo.delete({ id, tenant_id: tenantId });
  }

  /** @returns {{ items: UnitView[], nextCursor }} UnitView = { unit, projectName, blockName, floorLabel } */
  async list(tenantId, { q, status, kind, projectId, sort, cursor, limit }) {
    const picked = parseSort(sort, UNIT_SORT_FIELDS, { field: 'unit_no', dir: 'asc' });
    const sorter = SORTS[picked.field];
    const query = createQuery();
    query.and('u.tenant_id = ?', tenantId);
    if (status) query.and('u.status = ?', status);
    if (kind) query.and('u.kind = ?', kind);
    if (projectId) query.and('u.project_id = ?', projectId);
    if (q?.trim()) {
      const like = likeContains(q.trim());
      query.and(
        "(u.unit_no ILIKE ? OR p.name ILIKE ? OR coalesce(b.name, '') ILIKE ?)",
        like,
        like,
        like,
      );
    }
    const page = await keysetSql(this.manager, {
      select: VIEW_COLUMNS,
      from: VIEW_SQL,
      query,
      sort: { expr: sorter.expr, dir: picked.dir, cast: sorter.cast },
      idExpr: 'u.id',
      cursor,
      limit,
      valueOf: (r) => String(sorter.pick(r)),
      idOf: (r) => r.id,
    });
    return { items: page.rows.map(toView), nextCursor: page.nextCursor };
  }

  async listShapes(tenantId, projectId) {
    const rows = await this.manager.query(
      `SELECT id, unit_no, block_id, kind, status, geometry FROM inventory.unit
        WHERE tenant_id = $1 AND project_id = $2 AND geometry IS NOT NULL ORDER BY unit_no`,
      [tenantId, projectId],
    );
    return rows.map((r) => ({
      unitId: r.id,
      unitNo: r.unit_no,
      blockId: r.block_id,
      kind: r.kind,
      status: r.status,
      x: r.geometry.x,
      y: r.geometry.y,
      w: r.geometry.w,
      h: r.geometry.h,
    }));
  }

  async listForLayout(tenantId, projectId) {
    const rows = await this.manager.query(
      'SELECT id, block_id, floor_id, unit_no FROM inventory.unit WHERE tenant_id = $1 AND project_id = $2 ORDER BY unit_no',
      [tenantId, projectId],
    );
    return rows.map((r) => ({
      id: r.id,
      blockId: r.block_id,
      floorId: r.floor_id,
      unitNo: r.unit_no,
    }));
  }

  async saveGeometry(tenantId, items) {
    for (const { unitId, geometry } of items) {
      await this.repo.update(
        { id: unitId, tenant_id: tenantId },
        { geometry, updated_at: () => 'now()' },
      );
    }
  }
}
