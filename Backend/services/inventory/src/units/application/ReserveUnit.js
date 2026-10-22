import { InvalidTransitionError, consumeOnce } from '@estateops/kernel';
import { unitBooked, unitBookingRejected } from '../../projects/application/events.js';
import { bookUnit } from '../domain/unit.js';
import { announceUnit } from './announce.js';

const SYSTEM = { userId: null, name: 'Sales' };

/**
 * Event booking.requested: reserve the unit for the booking, or reject the booking if the unit is
 * gone or no longer for sale. The row is locked, so two requests for one unit cannot both win.
 */
export class ReserveUnit {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute(event) {
    const { booking_id: bookingId, unit_id: unitId } = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const now = this.clock.now();
        const unit = await repos.units.findById(event.tenant_id, unitId, { lock: true });
        let reason = null;
        if (!unit) reason = 'The unit no longer exists';
        else if (unit.status !== 'available' && unit.status !== 'held')
          reason = `The unit is ${unit.status}`;

        if (reason) {
          await repos.outbox.add(
            unitBookingRejected(bookingId, unitId, event.tenant_id, reason, now),
          );
          return;
        }
        let booked;
        try {
          booked = bookUnit(unit, bookingId);
        } catch (error) {
          if (!(error instanceof InvalidTransitionError)) throw error;
          await repos.outbox.add(
            unitBookingRejected(bookingId, unitId, event.tenant_id, error.message, now),
          );
          return;
        }
        const saved = await repos.units.update(booked);
        await repos.unitHistory.add({
          tenantId: event.tenant_id,
          unitId,
          status: 'booked',
          changedBy: null,
          changedByName: SYSTEM.name,
        });
        await repos.audit.record({
          tenantId: event.tenant_id,
          actor: SYSTEM,
          action: 'unit.book',
          subjectType: 'unit',
          subjectId: unitId,
          before: { status: unit.status },
          after: { status: 'booked', bookingId },
        });
        await repos.outbox.add(unitBooked(bookingId, unitId, event.tenant_id, now));
        await announceUnit({ repos, unit: saved, clock: this.clock });
      }),
    );
  }
}
