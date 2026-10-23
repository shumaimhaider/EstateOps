import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { paymentsRepository } from '../data/payments.repository.js';
import { paymentKeys } from './payment.keys.js';

/** A customer's saved cards, the active one first. */
export function usePaymentMethodsQuery(customerId, { enabled = true } = {}) {
  return useQuery({
    queryKey: paymentKeys.methods(customerId),
    queryFn: ({ signal }) => paymentsRepository.listMethods(customerId, { signal }),
    enabled: Boolean(customerId) && enabled,
    staleTime: 15_000,
  });
}

const refresh = (queryClient, customerId) => () =>
  queryClient.invalidateQueries({ queryKey: paymentKeys.methods(customerId) });

export function useActivateMethodMutation(customerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      paymentsRepository.activateMethod(customerId, id, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: refresh(queryClient, customerId),
  });
}

export function useRemoveMethodMutation(customerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      paymentsRepository.removeMethod(customerId, id, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: refresh(queryClient, customerId),
  });
}
