import { ConflictError } from '@estateops/kernel';
import { pgCode, rowsOf } from '@estateops/platform';

const toRule = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  scope: r.scope,
  scopeId: r.scope_id,
  unitKind: r.unit_kind,
  kind: r.kind,
  value: r.value,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
  version: r.version,
});

const ORDER =
  "CASE scope WHEN 'default' THEN 0 WHEN 'project' THEN 1 WHEN 'unit' THEN 2 ELSE 3 END, coalesce(unit_kind, ''), id";

/** The winning rule for each overdue invoice, resolved in SQL in the same order as resolveRule(). */
const PRICE_SQL = `
  WITH priced AS (
    SELECT i.id, COALESCE((
      SELECT CASE r.kind WHEN 'percent' THEN floor((i.amount::numeric * r.value + 5000) / 10000)::bigint ELSE r.value END
        FROM billing.fine_rule r
       WHERE r.tenant_id = i.tenant_id AND (
             (r.scope = 'customer' AND r.scope_id = i.customer_id AND (r.unit_kind IS NULL OR r.unit_kind = i.unit_kind))
          OR (r.scope = 'unit' AND r.scope_id = i.unit_id)
          OR (r.scope = 'project' AND r.scope_id = i.project_id AND (r.unit_kind IS NULL OR r.unit_kind = i.unit_kind))
          OR (r.scope = 'default' AND (r.unit_kind IS NULL OR r.unit_kind = i.unit_kind)))
       ORDER BY CASE r.scope
                  WHEN 'customer' THEN CASE WHEN r.unit_kind IS NULL THEN 2 ELSE 1 END
                  WHEN 'unit' THEN 3
                  WHEN 'project' THEN CASE WHEN r.unit_kind IS NULL THEN 5 ELSE 4 END
                  ELSE CASE WHEN r.unit_kind IS NULL THEN 7 ELSE 6 END END
       LIMIT 1), 0) AS fine
      FROM billing.installment i
     WHERE i.tenant_id = $1 AND i.id = ANY($2::uuid[]) AND i.status = 'overdue')
  UPDATE billing.installment i SET fine_amount = p.fine, updated_at = now(), version = i.version + 1
    FROM priced p WHERE i.id = p.id AND i.fine_amount <> p.fine
  RETURNING i.id, i.booking_id`;

export class FineRuleRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async list(tenantId) {
    const rows = await this.manager.query(
      `SELECT * FROM billing.fine_rule WHERE tenant_id = $1 ORDER BY ${ORDER}`,
      [tenantId],
    );
    return rows.map(toRule);
  }

  async findById(tenantId, id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const rows = await this.manager.query(
      'SELECT * FROM billing.fine_rule WHERE tenant_id = $1 AND id = $2',
      [tenantId, id],
    );
    return rows[0] ? toRule(rows[0]) : null;
  }

  async insert(rule, updatedBy) {
    try {
      await this.manager.query(
        'INSERT INTO billing.fine_rule (id, tenant_id, scope, scope_id, unit_kind, kind, value, updated_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          rule.id,
          rule.tenantId,
          rule.scope,
          rule.scopeId,
          rule.unitKind,
          rule.kind,
          rule.value,
          updatedBy,
        ],
      );
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError(
          'FINE_RULE_EXISTS',
          'A rate already exists at this level and category',
        );
      throw error;
    }
    return { ...rule, updatedByName: updatedBy, updatedAt: new Date() };
  }

  async update(rule, updatedBy) {
    const rows = rowsOf(
      await this.manager.query(
        `UPDATE billing.fine_rule SET kind = $3, value = $4, updated_by_name = $5, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND id = $2 AND version = $6 RETURNING version, updated_at`,
        [rule.tenantId, rule.id, rule.kind, rule.value, updatedBy, rule.version],
      ),
    );
    if (rows.length === 0)
      throw new ConflictError(
        'VERSION_CONFLICT',
        'Someone else changed this rate. Reload and try again.',
      );
    return {
      ...rule,
      updatedByName: updatedBy,
      updatedAt: rows[0].updated_at,
      version: rows[0].version,
    };
  }

  async delete(tenantId, id) {
    await this.manager.query('DELETE FROM billing.fine_rule WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      id,
    ]);
  }

  async targetExists(tenantId, scope, id) {
    const table = { project: 'project_ref', unit: 'unit_ref', customer: 'customer_ref' }[scope];
    const key = { project: 'project_id', unit: 'unit_id', customer: 'customer_id' }[scope];
    if (!table || !/^[0-9a-f-]{36}$/i.test(String(id))) return false;
    const rows = await this.manager.query(
      `SELECT 1 FROM billing.${table} WHERE tenant_id = $1 AND ${key} = $2`,
      [tenantId, id],
    );
    return rows.length > 0;
  }

  async scopeName(tenantId, rule) {
    if (rule.scope === 'default') return null;
    const queries = {
      project: [
        'SELECT name AS n FROM billing.project_ref WHERE tenant_id = $1 AND project_id = $2',
      ],
      customer: [
        'SELECT full_name AS n FROM billing.customer_ref WHERE tenant_id = $1 AND customer_id = $2',
      ],
      unit: [
        "SELECT unit_no || ' · ' || project_name AS n FROM billing.unit_ref WHERE tenant_id = $1 AND unit_id = $2",
      ],
    };
    const rows = await this.manager.query(queries[rule.scope][0], [tenantId, rule.scopeId]);
    return rows[0]?.n ?? '';
  }

  /** The project, category and current buyer of a unit, for resolving the rate that applies to it. */
  async unitFacts(tenantId, unitId) {
    const [unit] = await this.manager.query(
      'SELECT project_id, kind FROM billing.unit_ref WHERE tenant_id = $1 AND unit_id = $2',
      [tenantId, unitId],
    );
    const [booking] = await this.manager.query(
      "SELECT customer_id FROM billing.booking_ref WHERE tenant_id = $1 AND unit_id = $2 AND status <> 'cancelled' LIMIT 1",
      [tenantId, unitId],
    );
    return {
      projectId: unit.project_id,
      kind: unit.kind,
      customerId: booking?.customer_id ?? null,
    };
  }

  /** Ids of unpaid overdue invoices in a scope, in id order, after a cursor id. */
  async overdueIds(tenantId, { projectId, customerId, unitId, unitKind }, afterId, limit) {
    const params = [tenantId];
    const where = ['i.tenant_id = $1', "i.status = 'overdue'"];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (projectId) add('i.project_id = ?', projectId);
    if (customerId) add('i.customer_id = ?', customerId);
    if (unitId) add('i.unit_id = ?', unitId);
    if (unitKind) add('i.unit_kind = ?', unitKind);
    if (afterId) add('i.id > ?', afterId);
    const rows = await this.manager.query(
      `SELECT i.id FROM billing.installment i WHERE ${where.join(' AND ')} ORDER BY i.id LIMIT ${Number(limit)}`,
      params,
    );
    return rows.map((r) => r.id);
  }

  /** Prices the fine of the given overdue invoices. Returns only the ones whose fine changed. */
  async repriceIds(tenantId, ids) {
    if (ids.length === 0) return [];
    return rowsOf(await this.manager.query(PRICE_SQL, [tenantId, ids])).map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
    }));
  }
}
