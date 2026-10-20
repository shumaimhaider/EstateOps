export const BOOKING_STATUS_META = Object.freeze({
  requested: { labelKey: 'sales:status.requested', tone: 'neutral' },
  in_review: { labelKey: 'sales:status.in_review', tone: 'warning' },
  confirmed: { labelKey: 'sales:status.confirmed', tone: 'info' },
  active: { labelKey: 'sales:status.active', tone: 'info' },
  completed: { labelKey: 'sales:status.completed', tone: 'success' },
  cancelled: { labelKey: 'sales:status.cancelled', tone: 'danger' },
});

export const BOOKING_SORT_FIELDS = Object.freeze([
  'unitNo',
  'totalPrice',
  'received',
  'pending',
  'overdue',
  'bookedAt',
  'nextDue',
]);
export const BOOKINGS_PAGE_SIZE = 25;
