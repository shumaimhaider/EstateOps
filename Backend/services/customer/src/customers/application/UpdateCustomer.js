import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updateCustomer } from '../domain/customer.js';
import { customerUpserted } from './events.js';

export class UpdateCustomer {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, patch }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.customers.findById(actor.tenantId, id);
      if (!current) throw new NotFoundError('Customer not found');
      const next = updateCustomer(current, patch);
      if (
        next.email &&
        next.email !== current.email &&
        (await repos.customers.emailTaken(actor.tenantId, next.email))
      ) {
        throw new ConflictError('EMAIL_TAKEN', 'A customer with this email already exists');
      }
      const saved = await repos.customers.update(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'customer.update',
        subjectType: 'customer',
        subjectId: id,
        // the ID number is never written to the audit trail
        before: {
          fullName: current.fullName,
          email: current.email,
          phone: current.phone,
          city: current.city,
        },
        after: {
          fullName: saved.fullName,
          email: saved.email,
          phone: saved.phone,
          city: saved.city,
        },
      });
      await repos.outbox.add(customerUpserted(saved, this.clock.now()));
      return saved;
    });
  }
}
