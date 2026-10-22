import { consumeOnce } from '@estateops/kernel';

const SYSTEM = { userId: null, name: 'Sales' };

/**
 * Event booking.cancelled: cancel every invoice nobody has paid anything on, and mark the booking
 * cancelled. Invoices with money received stay as they are so finance can sort out any refund. If
 * the booking was never scheduled here, the cancellation is remembered so a late confirmation
 * cannot create a schedule for it.
 */
export class CancelBookingInvoices {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const bookingId = event.data.booking_id;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const ref = await repos.bookingRefs.findById(event.tenant_id, bookingId);
        if (!ref) {
          await repos.bookingRefs.rememberCancelled(event.tenant_id, bookingId);
          return;
        }
        const cancelled = await repos.installments.cancelUnpaidOfBooking(
          event.tenant_id,
          bookingId,
        );
        await repos.bookingRefs.markCancelled(bookingId);
        await repos.audit.record({
          tenantId: event.tenant_id,
          actor: SYSTEM,
          action: 'schedule.cancel',
          subjectType: 'booking',
          subjectId: bookingId,
          after: { invoicesCancelled: cancelled },
        });
      }),
    );
  }
}
