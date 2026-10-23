import { consumeOnce } from '@estateops/kernel';
import { applySummary, bookingMachine, transitionTo } from '../domain/booking.js';
import { bookingCancelled, bookingCompleted, bookingConfirmed } from './events.js';

const SYSTEM = { userId: null, name: 'System' };

/**
 * The booking's side of the saga, one handler per event. Each runs once per event id and moves
 * the booking only along transitions its state allows, so late or repeated events are harmless.
 *   unit.booked           requested -> confirmed, announces booking.confirmed (or, if the booking
 *                         was cancelled meanwhile, re-announces booking.cancelled to free the unit)
 *   unit.booking_rejected requested -> cancelled with the reason
 *   schedule.created      confirmed -> active
 *   schedule.failed       requested|confirmed -> cancelled (compensation), announces booking.cancelled so the
 *                         unit is freed, any partial invoices removed and contracts voided
 *   booking.fully_paid    active -> completed, announces booking.completed
 *   booking.summary_changed  new money figures (seq-guarded)
 */
export class FollowSaga {
  constructor({ uow, clock, step }) {
    Object.assign(this, { uow, clock, step });
  }

  async execute(event) {
    const bookingId = event.data.booking_id;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const booking = await repos.bookings.findById(event.tenant_id, bookingId, { lock: true });
        if (!booking) return;
        await this[this.step](repos, booking, event);
      }),
    );
  }

  async #move(repos, booking, action, event, extra = {}) {
    if (!bookingMachine.can(booking.status, action)) return null;
    const saved = await repos.bookings.update(transitionTo(booking, action, extra));
    await repos.audit.record({
      tenantId: booking.tenantId,
      actor: SYSTEM,
      action: `booking.${action}`,
      subjectType: 'booking',
      subjectId: booking.id,
      before: { status: booking.status },
      after: {
        status: saved.status,
        ...(extra.cancelReason ? { reason: extra.cancelReason } : {}),
      },
    });
    return saved;
  }

  async confirmed(repos, booking, event) {
    if (booking.status === 'cancelled') {
      // cancelled while inventory was still reserving: say so again so the unit is released
      await repos.outbox.add(bookingCancelled(booking, this.clock.now()));
      return;
    }
    const saved = await this.#move(repos, booking, 'confirm', event);
    if (saved) await repos.outbox.add(bookingConfirmed(saved, this.clock.now()));
  }

  async rejected(repos, booking, event) {
    await this.#move(repos, booking, 'reject', event, { cancelReason: event.data.reason });
  }

  async scheduled(repos, booking, event) {
    await this.#move(repos, booking, 'activate', event);
  }

  async scheduleFailed(repos, booking, event) {
    const saved = await this.#move(repos, booking, 'abort', event, {
      cancelReason: `SCHEDULE_FAILED: ${event.data.reason}`.slice(0, 200),
    });
    if (saved) await repos.outbox.add(bookingCancelled(saved, this.clock.now()));
  }

  async paid(repos, booking, event) {
    const saved = await this.#move(repos, booking, 'complete', event);
    if (saved) await repos.outbox.add(bookingCompleted(saved, this.clock.now()));
  }

  async summary(repos, booking, event) {
    const next = applySummary(booking, event.data);
    if (next !== booking) await repos.bookings.update(next);
  }
}
