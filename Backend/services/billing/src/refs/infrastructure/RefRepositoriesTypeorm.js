import { upsertRef } from '@estateops/platform';

const ref = (manager, name, key) => (columns, sourceAt) =>
  upsertRef(manager, { schema: 'billing', name, key, columns, sourceAt });

export class TenantRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId) {
    const rows = await this.manager.query('SELECT * FROM billing.tenant_ref WHERE tenant_id = $1', [
      tenantId,
    ]);
    const r = rows[0];
    return r
      ? {
          tenantId: r.tenant_id,
          slug: r.slug,
          name: r.name,
          currency: r.currency.trim(),
          locale: r.locale,
          timeZone: r.time_zone,
          areaUnit: r.area_unit,
        }
      : null;
  }

  upsert(t, sourceAt) {
    return ref(
      this.manager,
      'tenant_ref',
      'tenant_id',
    )(
      {
        tenant_id: t.tenantId,
        slug: t.slug,
        name: t.name,
        currency: t.currency,
        locale: t.locale,
        time_zone: t.timeZone,
        area_unit: t.areaUnit,
      },
      sourceAt,
    );
  }
}

export class ProjectRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  upsert(p, sourceAt) {
    return ref(
      this.manager,
      'project_ref',
      'project_id',
    )({ project_id: p.projectId, tenant_id: p.tenantId, name: p.name, kind: p.kind }, sourceAt);
  }
}

export class UnitRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  upsert(u, sourceAt) {
    return ref(
      this.manager,
      'unit_ref',
      'unit_id',
    )(
      {
        unit_id: u.unitId,
        tenant_id: u.tenantId,
        project_id: u.projectId,
        project_name: u.projectName,
        unit_no: u.unitNo,
        kind: u.kind,
        status: u.status,
        list_price: u.listPrice,
        currency: u.currency,
      },
      sourceAt,
    );
  }
}

export class CustomerRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async find(tenantId, customerId) {
    const rows = await this.manager.query(
      'SELECT customer_id, full_name, phone, email FROM billing.customer_ref WHERE tenant_id = $1 AND customer_id = $2',
      [tenantId, customerId],
    );
    const r = rows[0];
    return r
      ? { customerId: r.customer_id, fullName: r.full_name, phone: r.phone, email: r.email }
      : null;
  }

  upsert(c, sourceAt) {
    return ref(
      this.manager,
      'customer_ref',
      'customer_id',
    )(
      {
        customer_id: c.customerId,
        tenant_id: c.tenantId,
        full_name: c.fullName,
        phone: c.phone,
        email: c.email,
      },
      sourceAt,
    );
  }
}
