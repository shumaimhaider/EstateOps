import { useQuery } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';
import { authKeys } from './auth.keys.js';

/** Mock mode only: seeded accounts for one-click sign-in and the Google chooser. */
export function useDevAccountsQuery({ enabled }) {
  return useQuery({
    queryKey: authKeys.devAccounts,
    queryFn: () => authRepository.devAccounts(),
    enabled,
    staleTime: Infinity,
  });
}
