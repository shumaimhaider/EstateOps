/**
 * Root query keys shared across features. A payment changes invoices, bookings, customers,
 * stats, escalations and units at once; features invalidate by root without importing each other.
 */
export const QUERY_ROOTS = Object.freeze({
  session: ['auth'],
  units: ['units'],
  projects: ['projects'],
  bookings: ['bookings'],
  customers: ['customers'],
  invoices: ['invoices'],
  escalations: ['escalations'],
  stats: ['stats'],
});

/** Everything a money movement can change. */
export const MONEY_ROOTS = [
  QUERY_ROOTS.invoices,
  QUERY_ROOTS.bookings,
  QUERY_ROOTS.customers,
  QUERY_ROOTS.escalations,
  QUERY_ROOTS.stats,
  QUERY_ROOTS.units,
  QUERY_ROOTS.projects,
];
