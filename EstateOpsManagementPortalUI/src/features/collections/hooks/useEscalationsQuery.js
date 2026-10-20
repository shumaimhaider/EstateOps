import { useInfiniteQuery } from '@tanstack/react-query';
import { ESCALATIONS_PAGE_SIZE } from '../domain/installment.constants.js';
import { escalationsRepository } from '../data/escalations.repository.js';
import { escalationKeys } from './collections.keys.js';

export function useEscalationsQuery() {
  const query = useInfiniteQuery({
    queryKey: escalationKeys.list(),
    queryFn: ({ pageParam, signal }) =>
      escalationsRepository.list({ cursor: pageParam, limit: ESCALATIONS_PAGE_SIZE, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  return { ...query, escalations: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
