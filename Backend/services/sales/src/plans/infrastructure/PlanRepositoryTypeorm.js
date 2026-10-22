import { EntitySchema } from 'typeorm';
import { ConflictError } from '@estateops/kernel';
import { pgCode, updateVersioned } from '@estateops/platform';

export const PlanRow = new EntitySchema({
  name: 'PlanRow',
  tableName: 'payment_plan',
  schema: 'sales',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    name: { type: 'text' },
    down_pct: { type: 'int' },
    installment_count: { type: 'int' },
    created_at: { type: 'timestamptz', insert: false, update: false },
    updated_at: { type: 'timestamptz', insert: false },
    version: { type: 'int', insert: false },
  },
});

const toPlan = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  name: r.name,
  downPct: r.down_pct,
  installmentCount: r.installment_count,
  version: r.version,
});
const taken = (error) => {
  if (pgCode(error) === '23505')
    throw new ConflictError('PLAN_NAME_TAKEN', 'A plan with this name already exists');
  throw error;
};

export class PlanRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(PlanRow);
  }

  async insert(p) {
    await this.repo
      .insert({
        id: p.id,
        tenant_id: p.tenantId,
        name: p.name,
        down_pct: p.downPct,
        installment_count: p.installmentCount,
      })
      .catch(taken);
    return p;
  }

  async findById(tenantId, id) {
    const r = await this.repo.findOneBy({ id, tenant_id: tenantId });
    return r ? toPlan(r) : null;
  }

  async nameTaken(tenantId, name) {
    const rows = await this.manager.query(
      'SELECT 1 FROM sales.payment_plan WHERE tenant_id = $1 AND lower(name) = lower($2) LIMIT 1',
      [tenantId, name],
    );
    return rows.length > 0;
  }

  async update(p) {
    const version = await updateVersioned(this.manager, PlanRow, {
      where: { id: p.id, tenant_id: p.tenantId },
      version: p.version,
      set: { name: p.name, down_pct: p.downPct, installment_count: p.installmentCount },
    }).catch(taken);
    return { ...p, version };
  }

  async inUse(tenantId, id) {
    const rows = await this.manager.query(
      'SELECT 1 FROM sales.booking WHERE tenant_id = $1 AND plan_id = $2 LIMIT 1',
      [tenantId, id],
    );
    return rows.length > 0;
  }

  async delete(tenantId, id) {
    await this.repo.delete({ id, tenant_id: tenantId });
  }

  async list(tenantId) {
    return (await this.repo.find({ where: { tenant_id: tenantId }, order: { name: 'ASC' } })).map(
      toPlan,
    );
  }
}
