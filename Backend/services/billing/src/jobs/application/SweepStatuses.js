import { today as todayOf } from '@estateops/kernel';
import { refreshBookings } from '../../installments/application/refreshBooking.js';

const BATCH = 5000;

/**
 * The daily sweep: unpaid invoices past their due date become due, past the grace days become
 * overdue. Invoices that just became overdue are priced for fines and their bookings' summaries
 * are announced. Work runs in batches of 5,000, each its own transaction, locking rows with
 * SKIP LOCKED so several replicas can sweep side by side without touching the same invoice.
 * Safe to run any number of times.
 */
export class SweepStatuses {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ batchSize = BATCH } = {}) {
    const today = todayOf(this.clock);
    const tenantIds = await this.uow.read((repos) => repos.installments.tenantsToSweep(today));
    const totals = { tenants: tenantIds.length, movedToDue: 0, movedToOverdue: 0 };
    for (const tenantId of tenantIds) {
      let moved;
      do {
        moved = await this.uow.run(async (repos) => {
          const settings = await repos.settings.get(tenantId);
          const rows = await repos.installments.sweepBatch(
            tenantId,
            today,
            settings.graceDays,
            batchSize,
          );
          const overdue = rows.filter((r) => r.status === 'overdue');
          await repos.fines.repriceIds(
            tenantId,
            overdue.map((r) => r.id),
          );
          await refreshBookings({
            repos,
            tenantId,
            bookingIds: rows.map((r) => r.bookingId),
            clock: this.clock,
          });
          totals.movedToOverdue += overdue.length;
          totals.movedToDue += rows.length - overdue.length;
          return rows.length;
        });
      } while (moved >= batchSize);
    }
    return totals;
  }
}
