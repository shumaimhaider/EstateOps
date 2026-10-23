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

/** Pictures of a unit: a row per picture pointing at its file_asset (the address is built in code). */
export class UnitMediaRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async add(m) {
    await this.manager.query(
      'INSERT INTO inventory.unit_media (id, tenant_id, unit_id, kind, file_id, caption, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [m.id, m.tenantId, m.unitId, m.kind, m.fileId, m.caption, m.sortOrder],
    );
  }

  async list(unitId) {
    const rows = await this.manager.query(
      `SELECT m.id, m.unit_id, m.kind, m.file_id, m.caption, m.sort_order,
              f.tenant_id, f.owner_type, f.owner_id, f.purpose, f.stored_name, f.original_name
         FROM inventory.unit_media m LEFT JOIN inventory.file_asset f ON f.id = m.file_id
        WHERE m.unit_id = $1 ORDER BY m.sort_order, m.created_at, m.id`,
      [unitId],
    );
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      kind: r.kind,
      fileId: r.file_id,
      caption: r.caption,
      sortOrder: r.sort_order,
      asset: r.file_id && {
        id: r.file_id,
        tenantId: r.tenant_id,
        ownerType: r.owner_type,
        ownerId: r.owner_id,
        purpose: r.purpose,
        storedName: r.stored_name,
        originalName: r.original_name,
      },
    }));
  }

  /** Deletes the picture row and returns { fileId }, or null when there was none. */
  async remove(tenantId, unitId, mediaId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(mediaId))) return null;
    const result = await this.manager.query(
      'DELETE FROM inventory.unit_media WHERE tenant_id = $1 AND unit_id = $2 AND id = $3 RETURNING id, file_id',
      [tenantId, unitId, mediaId],
    );
    const row = rowsOf(result)[0];
    return row ? { id: row.id, fileId: row.file_id } : null;
  }
}
