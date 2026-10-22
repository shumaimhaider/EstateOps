import { PERMISSION, assertCan } from '@estateops/kernel';
import { refreshBookings } from '../../installments/application/refreshBooking.js';
import { createSettings } from '../domain/settings.js';

/**
 * Changes the grace days and the escalation threshold. A new threshold changes which bookings are
 * escalated, so the bookings that have overdue invoices announce a fresh summary.
 */
export class UpdateSettings {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, input }) {
    assertCan(actor, PERMISSION.FINES_MANAGE);
    const next = createSettings(input);
    return this.uow.run(async (repos) => {
      const before = await repos.settings.get(actor.tenantId);
      const saved = await repos.settings.put(actor.tenantId, next, actor.name);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'collection_settings.update',
        subjectType: 'settings',
        subjectId: actor.tenantId,
        before,
        after: saved,
      });
      if (before.escalationMissed !== saved.escalationMissed) {
        const bookingIds = await repos.summaries.bookingsWithOverdue(actor.tenantId);
        await refreshBookings({ repos, tenantId: actor.tenantId, bookingIds, clock: this.clock });
      }
      return saved;
    });
  }
}
