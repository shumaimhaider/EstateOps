import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const contractKeys = {
  all: QUERY_ROOTS.contracts,
  list: (bookingId) => [...QUERY_ROOTS.contracts, 'list', bookingId],
};
