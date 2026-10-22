import { PERMISSION, assertCan, can } from '@estateops/kernel';

/** Plans are few per tenant, so the list is returned whole, by name. */
export class ListPlans {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const items = await this.uow.read((repos) => repos.plans.list(actor.tenantId));
    const allowedActions = can(actor, PERMISSION.SALES_MANAGE) ? ['update', 'delete'] : [];
    return { items: items.map((plan) => ({ plan, allowedActions })), nextCursor: null };
  }
}
