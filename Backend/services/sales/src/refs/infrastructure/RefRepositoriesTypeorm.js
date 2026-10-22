import { upsertRef } from '@estateops/platform';

const num = Number;

export class UnitRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId, unitId) {
    const rows = await this.manager.query(
      'SELECT * FROM sales.unit_ref WHERE tenant_id = $1 AND unit_id = $2',
      [tenantId, unitId],
    );
    const r = rows[0];
    return r
      ? {
          unitId: r.unit_id,
          tenantId: r.tenant_id,
          projectId: r.project_id,
          projectName: r.project_name,
          unitNo: r.unit_no,
          kind: r.kind,
          status: r.status,
          listPrice: num(r.list_price),
          currency: r.currency.trim(),
        }
      : null;
  }

  upsert(u, sourceAt) {
    return upsertRef(this.manager, {
      schema: 'sales',
      name: 'unit_ref',
      key: 'unit_id',
      sourceAt,
      columns: {
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
    });
  }
}

export class CustomerRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId, customerId) {
    const rows = await this.manager.query(
      'SELECT * FROM sales.customer_ref WHERE tenant_id = $1 AND customer_id = $2',
      [tenantId, customerId],
    );
    const r = rows[0];
    return r
      ? {
          customerId: r.customer_id,
          tenantId: r.tenant_id,
          fullName: r.full_name,
          phone: r.phone,
          email: r.email,
        }
      : null;
  }

  upsert(c, sourceAt) {
    return upsertRef(this.manager, {
      schema: 'sales',
      name: 'customer_ref',
      key: 'customer_id',
      sourceAt,
      columns: {
        customer_id: c.customerId,
        tenant_id: c.tenantId,
        full_name: c.fullName,
        phone: c.phone,
        email: c.email,
      },
    });
  }
}
