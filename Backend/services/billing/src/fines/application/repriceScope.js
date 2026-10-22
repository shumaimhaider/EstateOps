import { refreshBookings } from '../../installments/application/refreshBooking.js';

const BATCH = 5000;

/**
 * Re-prices the fine on unpaid overdue invoices inside a scope (a project, a customer, a property,
 * optionally one category) in batches, then announces the affected bookings' summaries. Paid
 * invoices keep the fine they were charged.
 */
export async function repriceScope({ repos, tenantId, filter, clock, batchSize = BATCH }) {
  let after = null;
  const touched = new Set();
  for (;;) {
    const ids = await repos.fines.overdueIds(tenantId, filter, after, batchSize);
    if (ids.length === 0) break;
    const changed = await repos.fines.repriceIds(tenantId, ids);
    changed.forEach((row) => touched.add(row.bookingId));
    after = ids.at(-1);
    if (ids.length < batchSize) break;
  }
  await refreshBookings({ repos, tenantId, bookingIds: [...touched], clock });
}

/** The invoice filter that matches a rule's scope. */
export const filterFor = ({ scope, scopeId, unitKind }) => ({
  ...(scope === 'project' ? { projectId: scopeId } : {}),
  ...(scope === 'customer' ? { customerId: scopeId } : {}),
  ...(scope === 'unit' ? { unitId: scopeId } : {}),
  ...(unitKind ? { unitKind } : {}),
});
