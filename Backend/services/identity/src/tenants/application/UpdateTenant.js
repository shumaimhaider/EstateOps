import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updateTenant } from '../domain/tenant.js';
import { tenantUpserted } from './events.js';

/** Changes the tenant's name, locale, time zone or area unit. Needs permissions.manage. */
export class UpdateTenant {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, patch }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.tenants.findById(actor.tenantId);
      if (!current) throw new NotFoundError('Tenant not found');
      const next = updateTenant(current, patch);
      const saved = await repos.tenants.update(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'tenant.update',
        subjectType: 'tenant',
        subjectId: current.id,
        before: {
          name: current.name,
          locale: current.locale,
          timeZone: current.timeZone,
          areaUnit: current.areaUnit,
        },
        after: {
          name: saved.name,
          locale: saved.locale,
          timeZone: saved.timeZone,
          areaUnit: saved.areaUnit,
        },
      });
      await repos.outbox.add(tenantUpserted(saved, this.clock.now()));
      return saved;
    });
  }
}
