import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const fineKeys = {
  all: QUERY_ROOTS.fineRules,
  list: () => [...QUERY_ROOTS.fineRules, 'list'],
  effective: (scope, scopeId, unitKind) => [
    ...QUERY_ROOTS.fineRules,
    'effective',
    scope,
    scopeId ?? null,
    unitKind ?? null,
  ],
};
