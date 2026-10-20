import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const bookingKeys = {
  all: QUERY_ROOTS.bookings,
  list: (filters) => [...QUERY_ROOTS.bookings, 'list', filters],
  detail: (id) => [...QUERY_ROOTS.bookings, 'detail', id],
};
