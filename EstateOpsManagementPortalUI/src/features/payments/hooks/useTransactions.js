import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { paymentsRepository } from '../data/payments.repository.js';
import { paymentKeys } from './payment.keys.js';

export const TRANSACTIONS_PAGE_SIZE = 25;

/** Card transactions, newest first. filters: { invoiceId?, customerId?, bookingId?, status? } */
export function useTransactionsQuery(filters = {}) {
  const query = useInfiniteQuery({
    queryKey: paymentKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) =>
      paymentsRepository.listTransactions(filters, {
        cursor: pageParam,
        limit: TRANSACTIONS_PAGE_SIZE,
        signal,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  return { ...query, transactions: query.data?.pages.flatMap((p) => p.items) ?? [] };
}

/** One transaction with the answer Stripe sent. */
export function useTransactionQuery(id) {
  return useQuery({
    queryKey: paymentKeys.transaction(id),
    queryFn: ({ signal }) => paymentsRepository.getTransaction(id, { signal }),
    enabled: Boolean(id),
  });
}
