import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updatePlan } from '../domain/plan.js';

/** Edits a plan. Bookings keep the plan they were sold under (a snapshot), so this is safe. */
export class UpdatePlan {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id, patch }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.plans.findById(actor.tenantId, id);
      if (!current) throw new NotFoundError('Payment plan not found');
      const next = updatePlan(current, patch);
      if (
        next.name.toLowerCase() !== current.name.toLowerCase() &&
        (await repos.plans.nameTaken(actor.tenantId, next.name))
      ) {
        throw new ConflictError('PLAN_NAME_TAKEN', 'A plan with this name already exists');
      }
      const saved = await repos.plans.update(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'plan.update',
        subjectType: 'plan',
        subjectId: id,
        before: {
          name: current.name,
          downPct: current.downPct,
          installmentCount: current.installmentCount,
        },
        after: {
          name: saved.name,
          downPct: saved.downPct,
          installmentCount: saved.installmentCount,
        },
      });
      return saved;
    });
  }
}
