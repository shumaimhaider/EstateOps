import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { applyStaffAction } from '../domain/unit.js';
import { announceUnit } from './announce.js';

/** Hold, release, block or unblock. Locks the unit row so two people cannot race. */
export class ActOnUnit {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, action }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.units.findById(actor.tenantId, id, { lock: true });
      if (!current) throw new NotFoundError('Unit not found');
      const next = applyStaffAction(current, action);
      const saved = await repos.units.update(next);
      await repos.unitHistory.add({
        tenantId: actor.tenantId,
        unitId: id,
        status: saved.status,
        changedBy: actor.userId,
        changedByName: actor.name,
      });
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: `unit.${action}`,
        subjectType: 'unit',
        subjectId: id,
        before: { status: current.status },
        after: { status: saved.status },
      });
      await announceUnit({ repos, unit: saved, clock: this.clock });
      return saved;
    });
  }
}
