import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';
import { authKeys } from './auth.keys.js';

/** Wires refresh-on-401; if refresh fails the session is dropped and the guard sends the user to login. */
export function useBindAuthLink() {
  const queryClient = useQueryClient();
  useEffect(() => {
    authRepository.attachAuthLink({
      onFailure: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
    });
  }, [queryClient]);
}
