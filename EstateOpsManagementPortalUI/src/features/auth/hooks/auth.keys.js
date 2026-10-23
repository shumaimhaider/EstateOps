import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';

export const authKeys = {
  me: [...QUERY_ROOTS.session, 'me'],
};
