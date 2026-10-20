import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';
import { authKeys } from './auth.keys.js';

/** Step 2: 2FA code -> session. Seeds the session query so the app opens without another fetch. */
export function useVerifyCodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => authRepository.verifyCode(input),
    onSuccess: (session) => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, session.user);
    },
  });
}
