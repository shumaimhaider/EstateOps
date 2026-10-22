import { upsertRef } from '@estateops/platform';

export class TenantRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId) {
    const rows = await this.manager.query(
      'SELECT tenant_id, currency FROM customer.tenant_ref WHERE tenant_id = $1',
      [tenantId],
    );
    return rows[0] ? { tenantId: rows[0].tenant_id, currency: rows[0].currency.trim() } : null;
  }

  upsert(ref, sourceAt) {
    return upsertRef(this.manager, {
      schema: 'customer',
      name: 'tenant_ref',
      key: 'tenant_id',
      sourceAt,
      columns: { tenant_id: ref.tenantId, currency: ref.currency },
    });
  }
}
