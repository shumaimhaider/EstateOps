import { InvalidTransitionError, consumeOnce } from '@estateops/kernel';
import { releaseUnit, sellUnit } from '../domain/unit.js';
import { announceUnit } from './announce.js';

const SYSTEM = { userId: null, name: 'Sales' };

/**
 * Events booking.completed (-> sold) and booking.cancelled (-> available). A unit already in the
 * target state or owned by another booking is left alone, so a late or repeated event is harmless.
 */
export class FollowBooking {
  constructor({ uow, clock, mode }) {
    if (!['sell', 'release'].includes(mode)) throw new Error(`Unknown mode ${mode}`);
    Object.assign(this, { uow, clock, mode });
  }

  async execute(event) {
    const { booking_id: bookingId, unit_id: unitId } = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const unit = await repos.units.findById(event.tenant_id, unitId, { lock: true });
        if (!unit) return;
        let next;
        try {
          next = this.mode === 'sell' ? sellUnit(unit, bookingId) : releaseUnit(unit, bookingId);
        } catch (error) {
          if (error instanceof InvalidTransitionError) return;
          throw error;
        }
        const saved = await repos.units.update(next);
        await repos.unitHistory.add({
          tenantId: event.tenant_id,
          unitId,
          status: saved.status,
          changedBy: null,
          changedByName: SYSTEM.name,
        });
        await repos.audit.record({
          tenantId: event.tenant_id,
          actor: SYSTEM,
          action: this.mode === 'sell' ? 'unit.sell' : 'unit.release_booking',
          subjectType: 'unit',
          subjectId: unitId,
          before: { status: unit.status },
          after: { status: saved.status },
        });
        await announceUnit({ repos, unit: saved, clock: this.clock });
      }),
    );
  }
}
