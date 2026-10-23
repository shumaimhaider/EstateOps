import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { paymentsRepository } from '../data/payments.repository.js';
import { paymentKeys } from './payment.keys.js';

/** Opens Stripe's embedded checkout for an invoice. Not optimistic: money is decided by Stripe and the server. */
export function useStartCheckoutMutation() {
  return useMutation({
    mutationFn: ({ invoiceId, payment, saveCard }) =>
      paymentsRepository.startCheckout(invoiceId, payment, {
        saveCard,
        idempotencyKey: newIdempotencyKey(),
      }),
  });
}

/** Opens Stripe's embedded form to save a card for a customer. */
export function useStartCardSetupMutation() {
  return useMutation({
    mutationFn: (customerId) =>
      paymentsRepository.startCardSetup(customerId, { idempotencyKey: newIdempotencyKey() }),
  });
}

/**
 * Where a checkout stands, asked once the embedded form reports it is done. While Stripe has not
 * finished (the server answers "open") it asks again every 1.5 s, then stops. A finished
 * payment refreshes everything money touches.
 */
export function useCheckoutResult(checkoutId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: paymentKeys.checkout(checkoutId),
    enabled: Boolean(checkoutId) && enabled,
    queryFn: ({ signal }) => paymentsRepository.checkoutStatus(checkoutId, { signal }),
    refetchInterval: (q) => (q.state.data?.status === 'open' ? 1_500 : false),
    gcTime: 0,
  });
  const settled = query.data && query.data.status !== 'open';
  useEffect(() => {
    if (!settled) return;
    // not the checkout query itself: refreshing it from inside would restart it
    for (const queryKey of [
      ...MONEY_ROOTS,
      paymentKeys.transactionsRoot(),
      paymentKeys.methodsRoot(),
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [settled, queryClient]);
  return query;
}

/** Charge the customer's active saved card against an invoice. */
export function useChargeSavedCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, payment }) =>
      paymentsRepository.chargeSavedCard(invoiceId, payment, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () =>
      Promise.all(
        [...MONEY_ROOTS, paymentKeys.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
