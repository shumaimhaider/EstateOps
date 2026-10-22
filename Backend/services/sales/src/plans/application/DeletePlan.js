import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** A plan that any booking was sold under stays, so the sales history keeps its reference. */
export class DeletePlan {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
    return this.uow.run(async (repos) => {
      const plan = await repos.plans.findById(actor.tenantId, id);
      if (!plan) throw new NotFoundError('Payment plan not found');
      if (await repos.plans.inUse(actor.tenantId, id)) {
        throw new ConflictError(
          'PLAN_IN_USE',
          'Bookings were sold under this plan, so it cannot be deleted',
        );
      }
      await repos.plans.delete(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'plan.delete',
        subjectType: 'plan',
        subjectId: id,
        before: { name: plan.name },
      });
    });
  }
}
