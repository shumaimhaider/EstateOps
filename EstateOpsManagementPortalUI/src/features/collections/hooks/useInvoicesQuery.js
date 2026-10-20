import { useInfiniteQuery } from '@tanstack/react-query';
import { INVOICES_PAGE_SIZE } from '../domain/installment.constants.js';
import { installmentsRepository } from '../data/installments.repository.js';
import { invoiceKeys } from './collections.keys.js';

/** Cursor-paginated invoice register; `invoices` is the flattened list of models. */
export function useInvoicesQuery(filters, { enabled = true } = {}) {
  const query = useInfiniteQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      installmentsRepository.list(filters, {
        cursor: pageParam,
        limit: INVOICES_PAGE_SIZE,
        signal,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    enabled,
  });
  return { ...query, invoices: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
