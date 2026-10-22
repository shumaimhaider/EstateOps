import { table } from '@estateops/platform';

const T = table('identity', 'role_permission');

/** Role grants per tenant: one row per (tenant, role, permission). */
export class RolePermissionRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId, role) {
    const rows = await this.manager.query(
      `SELECT rp.permission_key FROM ${T} rp
         JOIN identity.permission p ON p.key = rp.permission_key
        WHERE rp.tenant_id = $1 AND rp.role = $2 ORDER BY p.sort_order`,
      [tenantId, role],
    );
    return rows.map((r) => r.permission_key);
  }

  async allByRole(tenantId) {
    const rows = await this.manager.query(
      `SELECT rp.role, rp.permission_key FROM ${T} rp
         JOIN identity.permission p ON p.key = rp.permission_key
        WHERE rp.tenant_id = $1 ORDER BY p.sort_order`,
      [tenantId],
    );
    const byRole = {};
    for (const { role, permission_key: key } of rows) (byRole[role] ??= []).push(key);
    return byRole;
  }

  async replace(tenantId, role, permissions) {
    await this.manager.query(`DELETE FROM ${T} WHERE tenant_id = $1 AND role = $2`, [
      tenantId,
      role,
    ]);
    if (permissions.length === 0) return;
    await this.manager.query(
      `INSERT INTO ${T} (tenant_id, role, permission_key) SELECT $1, $2, unnest($3::text[])`,
      [tenantId, role, permissions],
    );
  }
}
