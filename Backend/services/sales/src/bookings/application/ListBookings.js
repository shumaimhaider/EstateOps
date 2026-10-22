import { PERMISSION, assertCan } from '@estateops/kernel';
import { bookingActions } from './allowedActions.js';

export const BOOKING_SORT_FIELDS = Object.freeze([
  'unit_no',
  'total_price',
  'received_amount',
  'pending_amount',
  'overdue_amount',
  'booked_at',
  'next_due_date',
]);

/** input: { actor, q, status, kind, projectId, unitId, customerId, escalated, sort, cursor, limit } */
export class ListBookings {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const page = await this.uow.read((repos) => repos.bookings.list(actor.tenantId, filters));
    return {
      ...page,
      items: page.items.map((booking) => ({
        booking,
        allowedActions: bookingActions(booking, actor),
      })),
    };
  }
}
