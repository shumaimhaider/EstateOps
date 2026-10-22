import { ConflictError, PERMISSION, assertCan } from '@estateops/kernel';
import { createPlan } from '../domain/plan.js';

/** Adds a payment plan. Needs sales.manage. input: { actor, name, downPct, installmentCount } */
export class CreatePlan {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, name, downPct, installmentCount }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
    const plan = createPlan({ tenantId: actor.tenantId, name, downPct, installmentCount });
    return this.uow.run(async (repos) => {
      if (await repos.plans.nameTaken(actor.tenantId, plan.name)) {
        throw new ConflictError('PLAN_NAME_TAKEN', 'A plan with this name already exists');
      }
      await repos.plans.insert(plan);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'plan.create',
        subjectType: 'plan',
        subjectId: plan.id,
        after: { name: plan.name, downPct, installmentCount },
      });
      return plan;
    });
  }
}
