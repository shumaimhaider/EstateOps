import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { cancelByStaff } from '../domain/booking.js';
import { bookingCancelled } from './events.js';

/**
 * Cancels a booking that has no payments. The unit is freed, open invoices are cancelled and open
 * contracts voided as the event reaches the other services. input: { actor, id, reason? }
 */
export class CancelBooking {
  constructor({ uow, clock, payments = null }) {
    Object.assign(this, { uow, clock, payments });
  }

  async execute({ actor, id, reason }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
    await this.#assertNoPayments(actor.tenantId, id);
    return this.uow.run(async (repos) => {
      const current = await repos.bookings.findById(actor.tenantId, id, { lock: true });
      if (!current) throw new NotFoundError('Booking not found');
      const saved = await repos.bookings.update(cancelByStaff(current, reason?.trim() || null));
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'booking.cancel',
        subjectType: 'booking',
        subjectId: id,
        before: { status: current.status },
        after: { status: 'cancelled', reason: saved.cancelReason },
      });
      // a booking still `requested` may already be reserved by inventory, so always tell the others
      await repos.outbox.add(bookingCancelled(saved, this.clock.now()));
      return saved;
    });
  }

  // Billing is the authority on money; sales' own copy of the figures can lag behind its events.
  async #assertNoPayments(tenantId, bookingId) {
    if (!this.payments) return;
    let found;
    try {
      found = await this.payments.hasPayments({ tenantId, bookingId });
    } catch {
      throw new ConflictError(
        'PAYMENT_CHECK_UNAVAILABLE',
        'Could not confirm whether this booking has payments. Try again in a moment.',
      );
    }
    if (found) {
      throw new ConflictError(
        'BOOKING_HAS_PAYMENTS',
        'A booking with payments cannot be cancelled',
      );
    }
  }
}
