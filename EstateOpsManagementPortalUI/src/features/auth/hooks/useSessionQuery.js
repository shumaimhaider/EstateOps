import { useQuery } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';
import { authKeys } from './auth.keys.js';

/** The signed-in user (the session). Resolves or rejects with 401 -> the guard redirects to login. */
export function useSessionQuery() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => authRepository.restoreSession({ signal }),
    staleTime: Infinity,
    retry: false,
  });
}

export const useCurrentUser = () => useSessionQuery().data;
