import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const customerKeys = {
  all: QUERY_ROOTS.customers,
  list: (filters) => [...QUERY_ROOTS.customers, 'list', filters],
  detail: (id) => [...QUERY_ROOTS.customers, 'detail', id],
};
