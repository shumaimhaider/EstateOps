import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { MONEY_ROOTS, QUERY_ROOTS } from '@/shared/lib/queryRoots.js';
import { paymentsRepository } from '../data/payments.repository.js';

export const paymentKeys = {
  all: QUERY_ROOTS.payments,
  cards: () => [...QUERY_ROOTS.payments, 'cards'],
  checkout: (id) => [...QUERY_ROOTS.payments, 'checkout', id],
  transactions: (bookingId) => [...QUERY_ROOTS.payments, 'transactions', bookingId ?? 'all'],
};

const refreshMoney = (queryClient) =>
  Promise.all(
    [...MONEY_ROOTS, paymentKeys.transactions().slice(0, 2)].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

/** Opens Stripe's embedded checkout for an invoice. variables: { invoiceId, payment: { amountMinor? }, saveCard? } */
export const useStartCheckoutMutation = () =>
  useMutation({
    mutationFn: ({ invoiceId, payment, saveCard }) =>
      paymentsRepository.startCheckout(
        invoiceId,
        { ...payment, saveCard },
        { idempotencyKey: newIdempotencyKey() },
      ),
  });

export const useStartCardSetupMutation = () =>
  useMutation({
    mutationFn: () => paymentsRepository.startCardSetup({ idempotencyKey: newIdempotencyKey() }),
  });

/**
 * Where a checkout stands, asked once Stripe's form reports it is done. While the server answers
 * "open" it asks again every 1.5 s. A settled payment refreshes everything money touches.
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
    refreshMoney(queryClient);
    queryClient.invalidateQueries({ queryKey: paymentKeys.cards() });
  }, [settled, queryClient]);
  return query;
}

/** Pay an invoice with the active saved card. variables: { invoiceId, payment } */
export function useChargeSavedCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, payment }) =>
      paymentsRepository.chargeSavedCard(invoiceId, payment, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => refreshMoney(queryClient),
  });
}

export const useCardsQuery = () =>
  useQuery({
    queryKey: paymentKeys.cards(),
    queryFn: ({ signal }) => paymentsRepository.listCards({ signal }),
    staleTime: 15_000,
  });

function useCardMutation(run) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => run(id, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: paymentKeys.cards() }),
  });
}
export const useActivateCardMutation = () => useCardMutation(paymentsRepository.activateCard);
export const useRemoveCardMutation = () => useCardMutation(paymentsRepository.removeCard);

export function useTransactionsQuery(bookingId) {
  const query = useInfiniteQuery({
    queryKey: paymentKeys.transactions(bookingId),
    queryFn: ({ pageParam, signal }) =>
      paymentsRepository.listTransactions({ bookingId, cursor: pageParam, limit: 25 }, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  return { ...query, transactions: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
