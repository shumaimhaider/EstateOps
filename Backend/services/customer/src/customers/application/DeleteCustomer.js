import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { hasBookings } from '../domain/customer.js';

/** A customer with bookings is part of the sales history and cannot be deleted. */
export class DeleteCustomer {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    return this.uow.run(async (repos) => {
      const customer = await repos.customers.findById(actor.tenantId, id);
      if (!customer) throw new NotFoundError('Customer not found');
      if (hasBookings(customer) || (await repos.customers.hasSummaries(actor.tenantId, id))) {
        throw new ConflictError(
          'CUSTOMER_HAS_BOOKINGS',
          'A customer with bookings cannot be deleted',
        );
      }
      await repos.customers.delete(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'customer.delete',
        subjectType: 'customer',
        subjectId: id,
        before: { fullName: customer.fullName },
      });
    });
  }
}
