import { PERMISSION, assertCan } from '@estateops/kernel';
import { customerActions } from './allowedActions.js';

export const CUSTOMER_SORT_FIELDS = Object.freeze([
  'full_name',
  'bookings_count',
  'total_value',
  'received_amount',
  'pending_amount',
  'overdue_amount',
]);

/** input: { actor, q, hasOverdue, sort, cursor, limit } -> { items: [{ customer, currency, allowedActions }], nextCursor } */
export class ListCustomers {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.CUSTOMERS_VIEW);
    return this.uow.read(async (repos) => {
      const page = await repos.customers.list(actor.tenantId, filters);
      const tenant = await repos.tenantRefs.get(actor.tenantId);
      return {
        ...page,
        items: page.items.map((customer) => ({
          customer,
          currency: tenant?.currency ?? null,
          allowedActions: customerActions(customer, actor),
        })),
      };
    });
  }
}
