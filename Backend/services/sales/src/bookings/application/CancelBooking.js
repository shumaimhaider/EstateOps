import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { cancelByStaff } from '../domain/booking.js';
import { bookingCancelled } from './events.js';

/**
 * Cancels a booking that has no payments. The unit is freed, open invoices are cancelled and open
 * contracts voided as the event reaches the other services. input: { actor, id, reason? }
 */
export class CancelBooking {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, reason }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
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
}
