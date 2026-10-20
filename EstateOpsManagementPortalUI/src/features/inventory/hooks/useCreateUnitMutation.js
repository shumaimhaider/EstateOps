import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { unitsRepository } from '../data/units.repository.js';
import { unitKeys } from './unit.keys.js';

/** Not optimistic: the server owns numbering and validation. */
export function useCreateUnitMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: (draft) =>
      unitsRepository.create(draft, { idempotencyKey: idempotency.get(draft) }),
    onSuccess: () => {
      idempotency.reset();
      return queryClient.invalidateQueries({ queryKey: unitKeys.all });
    },
  });
}
