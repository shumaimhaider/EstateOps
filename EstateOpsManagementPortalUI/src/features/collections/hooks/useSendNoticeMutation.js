import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { escalationsRepository } from '../data/escalations.repository.js';
import { escalationKeys } from './collections.keys.js';

export function useSendNoticeMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: (escalationId) =>
      escalationsRepository.sendNotice(escalationId, {
        idempotencyKey: idempotency.get(escalationId),
      }),
    onSuccess: () => {
      idempotency.reset();
      return queryClient.invalidateQueries({ queryKey: escalationKeys.all });
    },
  });
}
