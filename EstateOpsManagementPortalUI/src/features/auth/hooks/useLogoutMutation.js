import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authRepository } from '../data/auth.repository.js';

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authRepository.logout(),
    onSettled: () => queryClient.clear(),
  });
}
