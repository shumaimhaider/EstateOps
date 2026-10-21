import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { installmentsRepository } from '../data/installments.repository.js';

/**
 * Charges the customer's card (Stripe) against an invoice. Never optimistic (money): after
 * success every money-derived view refetches. The card is not part of the idempotency
 * fingerprint, so a retry with a corrected card reuses the same payment.
 * variables: { invoiceId, payment, card: { number, expiry, cvc } }
 */
export function useCardPaymentMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: ({ invoiceId, payment, card }) =>
      installmentsRepository.payByCard(invoiceId, payment, card, {
        idempotencyKey: idempotency.get({ invoiceId, payment }),
      }),
    onSuccess: () => {
      idempotency.reset();
      return Promise.all(
        MONEY_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}
