import { upsertRef } from '@estateops/platform';

/** Local copy of each tenant's currency and area unit, kept current by tenant.upserted events. */
export class TenantRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId) {
    const rows = await this.manager.query(
      'SELECT * FROM inventory.tenant_ref WHERE tenant_id = $1',
      [tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      tenantId: r.tenant_id,
      slug: r.slug,
      name: r.name,
      currency: r.currency.trim(),
      locale: r.locale,
      timeZone: r.time_zone,
      areaUnit: r.area_unit,
    };
  }

  upsert(ref, sourceAt) {
    return upsertRef(this.manager, {
      schema: 'inventory',
      name: 'tenant_ref',
      key: 'tenant_id',
      sourceAt,
      columns: {
        tenant_id: ref.tenantId,
        slug: ref.slug,
        name: ref.name,
        currency: ref.currency,
        locale: ref.locale,
        time_zone: ref.timeZone,
        area_unit: ref.areaUnit,
      },
    });
  }
}
