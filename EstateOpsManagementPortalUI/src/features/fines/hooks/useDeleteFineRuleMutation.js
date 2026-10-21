import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { fineRulesRepository } from '../data/fineRules.repository.js';
import { fineKeys } from './fines.keys.js';

/** Removes an override so the level inherits again. variables: the rule id. */
export function useDeleteFineRuleMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: (id) => fineRulesRepository.remove(id, { idempotencyKey: idempotency.get(id) }),
    onSuccess: () => {
      idempotency.reset();
      return Promise.all(
        [fineKeys.all, ...MONEY_ROOTS].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
