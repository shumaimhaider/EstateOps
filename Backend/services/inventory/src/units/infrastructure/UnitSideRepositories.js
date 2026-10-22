import { newId } from '@estateops/kernel';
import { rowsOf } from '@estateops/platform';

/** Status history of a unit: one row per change, with who made it. */
export class UnitHistoryRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async add({ tenantId, unitId, status, changedBy, changedByName }) {
    await this.manager.query(
      `INSERT INTO inventory.unit_status_history (id, tenant_id, unit_id, status, changed_by, changed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId(), tenantId, unitId, status, changedBy, changedByName],
    );
  }

  async list(unitId) {
    const rows = await this.manager.query(
      'SELECT status, changed_by, changed_by_name, changed_at FROM inventory.unit_status_history WHERE unit_id = $1 ORDER BY changed_at, id',
      [unitId],
    );
    return rows.map((r) => ({
      status: r.status,
      changedBy: r.changed_by,
      changedByName: r.changed_by_name,
      changedAt: r.changed_at,
    }));
  }
}

/** Pictures of a unit (web addresses; the files live in object storage). */
export class UnitMediaRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async add(m) {
    await this.manager.query(
      'INSERT INTO inventory.unit_media (id, tenant_id, unit_id, kind, url, caption, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [m.id, m.tenantId, m.unitId, m.kind, m.url, m.caption, m.sortOrder],
    );
  }

  async list(unitId) {
    const rows = await this.manager.query(
      'SELECT * FROM inventory.unit_media WHERE unit_id = $1 ORDER BY sort_order, created_at, id',
      [unitId],
    );
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      kind: r.kind,
      url: r.url,
      caption: r.caption,
      sortOrder: r.sort_order,
    }));
  }

  async remove(tenantId, unitId, mediaId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(mediaId))) return false;
    const result = await this.manager.query(
      'DELETE FROM inventory.unit_media WHERE tenant_id = $1 AND unit_id = $2 AND id = $3 RETURNING id',
      [tenantId, unitId, mediaId],
    );
    return rowsOf(result).length > 0;
  }
}
