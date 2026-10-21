import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const permissionKeys = {
  all: QUERY_ROOTS.permissions,
  matrix: () => [...QUERY_ROOTS.permissions, 'matrix'],
};
