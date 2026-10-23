import { rowsOf } from '@estateops/platform';

const fromRow = (r) =>
  r
    ? {
        id: r.id,
        tenantId: r.tenant_id,
        ownerType: r.owner_type,
        ownerId: r.owner_id,
        purpose: r.purpose,
        storedName: r.stored_name,
        originalName: r.original_name,
        contentType: r.content_type,
        size: Number(r.size_bytes),
        status: r.status,
        createdBy: r.created_by,
      }
    : null;
const UUID = /^[0-9a-f-]{36}$/i;

export class FileAssetRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(a) {
    await this.manager.query(
      `INSERT INTO inventory.file_asset (id, tenant_id, owner_type, owner_id, purpose, stored_name,
         original_name, content_type, size_bytes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        a.id,
        a.tenantId,
        a.ownerType,
        a.ownerId,
        a.purpose,
        a.storedName,
        a.originalName,
        a.contentType,
        a.size,
        a.status,
        a.createdBy,
      ],
    );
  }

  async findById(tenantId, id) {
    if (!UUID.test(String(id))) return null;
    const rows = rowsOf(
      await this.manager.query(
        'SELECT * FROM inventory.file_asset WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      ),
    );
    return fromRow(rows[0]);
  }

  async setStatus(tenantId, id, status) {
    await this.manager.query(
      `UPDATE inventory.file_asset SET status = $3, ready_at = CASE WHEN $3 = 'ready' THEN clock_timestamp() ELSE ready_at END
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, status],
    );
  }

  /** The newest ready file for an owner and purpose (e.g. a project's site map). */
  async latestReady(tenantId, ownerType, ownerId, purpose) {
    const rows = rowsOf(
      await this.manager.query(
        `SELECT * FROM inventory.file_asset WHERE tenant_id = $1 AND owner_type = $2 AND owner_id = $3
           AND purpose = $4 AND status = 'ready' ORDER BY ready_at DESC, id LIMIT 1`,
        [tenantId, ownerType, ownerId, purpose],
      ),
    );
    return fromRow(rows[0]);
  }

  /** Uploads nobody confirmed within `olderThanMs`, for the clean-up job. */
  async listStalePending(olderThanMs, limit = 100) {
    const rows = rowsOf(
      await this.manager.query(
        `SELECT * FROM inventory.file_asset WHERE status = 'pending'
           AND created_at < now() - ($1::bigint * interval '1 millisecond') ORDER BY created_at LIMIT $2`,
        [olderThanMs, limit],
      ),
    );
    return rows.map(fromRow);
  }
}
