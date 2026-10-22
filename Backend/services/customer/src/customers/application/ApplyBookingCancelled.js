import { consumeOnce } from '@estateops/kernel';

/** Event booking.cancelled: the booking no longer counts toward the customer's totals. */
export class ApplyBookingCancelled {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const { booking_id: bookingId, customer_id: customerId } = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        await repos.bookingSummaries.markCancelled(event.tenant_id, bookingId);
        await repos.customers.recomputeTotals(event.tenant_id, customerId);
      }),
    );
  }
}
