import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';
import { authKeys } from './auth.keys.js';

/** Google sign-in: exchanges the Google id token for a session (Google already did 2FA). */
export function useGoogleLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idToken) => authRepository.loginWithGoogle(idToken),
    onSuccess: (session) => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, session.user);
    },
  });
}
