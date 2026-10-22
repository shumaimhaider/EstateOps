import { bookingFullyPaid, bookingSummaryChanged } from './events.js';

/**
 * Recomputes a booking's money position from its invoices and tells the other services. Called after
 * anything that changes an invoice. Announces booking.fully_paid once, the moment the sale settles.
 * The `seq` rises with every summary so a late older one is ignored by the receivers.
 */
export async function refreshBooking({ repos, tenantId, bookingId, clock }) {
  const ref = await repos.bookingRefs.findById(tenantId, bookingId);
  if (!ref || ref.status === 'cancelled') return null;
  const settings = await repos.settings.get(tenantId);
  const summary = await repos.summaries.compute(tenantId, bookingId, settings.escalationMissed);
  const seq = await repos.bookingRefs.nextSeq(bookingId);
  const now = clock.now();
  await repos.outbox.add(bookingSummaryChanged(ref, summary, seq, now));
  const settled =
    summary.installmentsTotal > 0 && summary.installmentsPaid === summary.installmentsTotal;
  if (settled && ref.status === 'active' && (await repos.bookingRefs.markCompleted(bookingId))) {
    await repos.outbox.add(bookingFullyPaid(ref, now));
  }
  return summary;
}

/**
 * The same, for each distinct booking in a list of invoices that changed. Bookings are always taken
 * in sorted order: every transaction that locks several bookings locks them in the same order, so
 * two of them can never wait on each other (a deadlock).
 */
export async function refreshBookings({ repos, tenantId, bookingIds, clock }) {
  for (const bookingId of [...new Set(bookingIds)].sort()) {
    await refreshBooking({ repos, tenantId, bookingId, clock });
  }
}
