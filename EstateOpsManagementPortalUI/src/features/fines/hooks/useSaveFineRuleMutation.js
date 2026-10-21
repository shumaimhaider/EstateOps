import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { fineRulesRepository } from '../data/fineRules.repository.js';
import { fineKeys } from './fines.keys.js';

/**
 * Sets the fine rate at a level. Changing a rate re-prices the fines on overdue invoices, so
 * every money-derived view refetches too.
 * variables: { scope, scopeId, kind, percent, amountMinor }
 */
export function useSaveFineRuleMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: (rule) => fineRulesRepository.save(rule, { idempotencyKey: idempotency.get(rule) }),
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
