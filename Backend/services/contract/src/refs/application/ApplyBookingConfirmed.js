import { consumeOnce } from '@estateops/kernel';

/** Event booking.confirmed: remember the booking and its buyer, so contracts can be drafted for them. */
export class ApplyBookingConfirmed {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, () =>
        repos.bookingRefs.upsert({
          bookingId: d.booking_id,
          tenantId: event.tenant_id,
          customerId: d.customer.id,
          customerName: d.customer.full_name,
          customerEmail: d.customer.email,
          unitNo: d.unit.unit_no,
        }),
      ),
    );
  }
}
