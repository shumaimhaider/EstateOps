import { NotFoundError, PERMISSION, assertCan, can } from '@estateops/kernel';

export class GetPlan {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const plan = await this.uow.read((repos) => repos.plans.findById(actor.tenantId, id));
    if (!plan) throw new NotFoundError('Payment plan not found');
    return {
      plan,
      allowedActions: can(actor, PERMISSION.SALES_MANAGE) ? ['update', 'delete'] : [],
    };
  }
}
