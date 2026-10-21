import { useMemo } from 'react';
import { useCurrentUser } from './useSessionQuery.js';

/**
 * What the signed-in user's role may see and do. The admin configures this per role; the UI
 * only asks `has(key)` and never inspects the role itself.
 */
export function usePermissions() {
  const user = useCurrentUser();
  return useMemo(() => {
    const granted = new Set(user?.permissions ?? []);
    return { has: (key) => granted.has(key) };
  }, [user]);
}

export const usePermission = (key) => usePermissions().has(key);
