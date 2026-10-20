import { useInfiniteQuery } from '@tanstack/react-query';
import { CUSTOMERS_PAGE_SIZE } from '../domain/customer.constants.js';
import { customersRepository } from '../data/customers.repository.js';
import { customerKeys } from './customer.keys.js';

export function useCustomersQuery(filters) {
  const query = useInfiniteQuery({
    queryKey: customerKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      customersRepository.list(filters, { cursor: pageParam, limit: CUSTOMERS_PAGE_SIZE, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  return { ...query, customers: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
