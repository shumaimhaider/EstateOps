import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { installmentsRepository } from '../data/installments.repository.js';

/**
 * Records a payment against an invoice on the customer's behalf. Never optimistic (money):
 * after success every money-derived view (invoices, bookings, customers, stats...) refetches.
 * variables: { invoiceId, payment: { method, amountMinor, reference } }
 */
export function useRecordPaymentMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: ({ invoiceId, payment }) =>
      installmentsRepository.recordPayment(invoiceId, payment, {
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
