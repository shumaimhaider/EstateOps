import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const invoiceKeys = {
  all: QUERY_ROOTS.invoices,
  list: (filters) => [...QUERY_ROOTS.invoices, 'list', filters],
};

export const escalationKeys = {
  all: QUERY_ROOTS.escalations,
  list: () => [...QUERY_ROOTS.escalations, 'list'],
};

export const statsKeys = {
  all: QUERY_ROOTS.stats,
  collections: (filters) => [...QUERY_ROOTS.stats, 'collections', filters],
};
