import { NotFoundError } from '@estateops/kernel';

/** Statuses a customer sees: a request that was cancelled is not "their property". */
const VISIBLE = new Set(['requested', 'confirmed', 'active', 'completed']);

/**
 * The customer portal's view of sales: only the signed-in customer's own bookings. The customer
 * and tenant come from the token (never the request), so another customer's booking is simply
 * "not found" and cannot be probed by id.
 */
export class ListMyBookings {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer, cursor, limit }) {
    const page = await this.uow.read((repos) =>
      repos.bookings.list(customer.tenantId, {
        customerId: customer.customerId,
        cursor,
        limit,
        sort: 'booked_at:desc',
      }),
    );
    return { ...page, items: page.items.filter((b) => VISIBLE.has(b.status)) };
  }
}

export class GetMyBooking {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer, id }) {
    const booking = await this.uow.read((repos) => repos.bookings.findById(customer.tenantId, id));
    if (!booking || booking.customerId !== customer.customerId || !VISIBLE.has(booking.status)) {
      throw new NotFoundError('Property not found');
    }
    return booking;
  }
}
