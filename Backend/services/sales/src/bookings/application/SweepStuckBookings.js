import { bookingMachine, transitionTo } from '../domain/booking.js';
import { bookingCancelled } from './events.js';

const SYSTEM = { userId: null, name: 'System' };

/**
 * Saga timeout. A booking that sits in `requested` (inventory never answered) or `confirmed`
 * (billing never built the schedule) past `timeoutMs` is rolled back: cancelled with a reason, and
 * booking.cancelled tells inventory to free the unit, billing to drop any invoices and contract to
 * void open contracts. Safe to run on every replica: each booking is locked and re-checked.
 */
export class SweepStuckBookings {
  constructor({ uow, clock, timeoutMs = 10 * 60_000, batch = 50 }) {
    Object.assign(this, { uow, clock, timeoutMs, batch });
  }

  async execute() {
    const cutoff = new Date(this.clock.now().getTime() - this.timeoutMs);
    const stuck = await this.uow.read((repos) => repos.bookings.listStuck(cutoff, this.batch));
    let cancelled = 0;
    for (const { tenantId, id } of stuck) {
      const done = await this.uow.run(async (repos) => {
        const booking = await repos.bookings.findById(tenantId, id, { lock: true });
        if (!booking || !bookingMachine.can(booking.status, 'abort')) return false;
        const saved = await repos.bookings.update(
          transitionTo(booking, 'abort', {
            cancelReason: `SAGA_TIMEOUT: stuck in ${booking.status}`,
          }),
        );
        await repos.audit.record({
          tenantId,
          actor: SYSTEM,
          action: 'booking.abort',
          subjectType: 'booking',
          subjectId: id,
          before: { status: booking.status },
          after: { status: saved.status, reason: saved.cancelReason },
        });
        await repos.outbox.add(bookingCancelled(saved, this.clock.now()));
        return true;
      });
      if (done) cancelled += 1;
    }
    return { cancelled };
  }
}
