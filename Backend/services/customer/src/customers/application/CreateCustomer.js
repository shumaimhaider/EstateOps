import { ConflictError, PERMISSION, assertCan } from '@estateops/kernel';
import { createCustomer } from '../domain/customer.js';
import { customerUpserted } from './events.js';

/** Adds a buyer. Needs customers.manage. An email belongs to one customer per tenant. */
export class CreateCustomer {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, ...fields }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    const customer = createCustomer({ tenantId: actor.tenantId, ...fields });
    return this.uow.run(async (repos) => {
      if (customer.email && (await repos.customers.emailTaken(actor.tenantId, customer.email))) {
        throw new ConflictError('EMAIL_TAKEN', 'A customer with this email already exists');
      }
      await repos.customers.insert(customer);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'customer.create',
        subjectType: 'customer',
        subjectId: customer.id,
        after: { fullName: customer.fullName, email: customer.email },
      });
      await repos.outbox.add(customerUpserted(customer, this.clock.now()));
      return customer;
    });
  }
}
