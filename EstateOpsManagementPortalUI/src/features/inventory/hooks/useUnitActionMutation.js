import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { unitsRepository } from '../data/units.repository.js';
import { unitKeys } from './unit.keys.js';

/** Runs a staff action ('block' | 'unblock') on a unit. variables: { id, action }. */
export function useUnitActionMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: ({ id, action }) => {
      const run = unitsRepository[action];
      if (!run) throw new Error(`Unsupported unit action: ${action}`);
      return run(id, { idempotencyKey: idempotency.get({ id, action }) });
    },
    onSuccess: () => {
      idempotency.reset();
      return queryClient.invalidateQueries({ queryKey: unitKeys.all });
    },
  });
}
