import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { customerActions } from './allowedActions.js';

export class GetCustomer {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.CUSTOMERS_VIEW);
    return this.uow.read(async (repos) => {
      const customer = await repos.customers.findById(actor.tenantId, id);
      if (!customer) throw new NotFoundError('Customer not found');
      const tenant = await repos.tenantRefs.get(actor.tenantId);
      return {
        customer,
        currency: tenant?.currency ?? null,
        allowedActions: customerActions(customer, actor),
      };
    });
  }
}
