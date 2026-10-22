import { refreshBookings } from '../../installments/application/refreshBooking.js';
import { filterFor } from './repriceScope.js';

/**
 * Event fine_rate.changed (a default rate): re-price in batches, each batch its own transaction, so
 * no request holds a tenant-wide lock. The work runs before the event is marked processed, so a
 * crash midway is retried; running twice is harmless because prices are recomputed, not added.
 */
export class ReapplyFineRate {
  constructor({ uow, clock, batchSize = 5000 }) {
    Object.assign(this, { uow, clock, batchSize });
  }

  async execute(event) {
    const { scope, scope_id: scopeId, unit_kind: unitKind } = event.data;
    const filter = filterFor({ scope, scopeId, unitKind });
    let after = null;
    let finished = false;
    while (!finished) {
      finished = await this.uow.run(async (repos) => {
        const ids = await repos.fines.overdueIds(event.tenant_id, filter, after, this.batchSize);
        if (ids.length === 0) return true;
        const changed = await repos.fines.repriceIds(event.tenant_id, ids);
        await refreshBookings({
          repos,
          tenantId: event.tenant_id,
          bookingIds: changed.map((c) => c.bookingId),
          clock: this.clock,
        });
        after = ids.at(-1);
        return ids.length < this.batchSize;
      });
    }
    const first = await this.uow.run((repos) => repos.processedEvents.markProcessed(event.id));
    return { duplicate: !first };
  }
}
