import { useMutation } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';

/** Step 1: email + password -> 2FA challenge. */
export function useLoginMutation() {
  return useMutation({ mutationFn: (credentials) => authRepository.login(credentials) });
}
