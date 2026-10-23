import { useInfiniteQuery } from '@tanstack/react-query';
import { collectionRunsRepository as repo } from '../data/collectionRuns.repository.js';

export const collectionRunKeys = {
  all: ['collection-runs'],
  days: () => ['collection-runs', 'days'],
  day: (date, status) => ['collection-runs', 'day', date, status ?? ''],
};

/** Days, newest first. */
export function useRunDaysQuery() {
  const query = useInfiniteQuery({
    queryKey: collectionRunKeys.days(),
    queryFn: ({ pageParam, signal }) => repo.listDays({ before: pageParam }, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    staleTime: 30_000,
  });
  return { ...query, days: query.data?.pages.flatMap((p) => p.items) ?? [] };
}

/** One day's invoices, optionally only one status; the first page carries the day's totals. */
export function useRunAttemptsQuery(date, status) {
  const query = useInfiniteQuery({
    queryKey: collectionRunKeys.day(date, status),
    queryFn: ({ pageParam, signal }) =>
      repo.listAttempts(date, { status, after: pageParam }, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextAfter ?? undefined,
    enabled: Boolean(date),
    staleTime: 15_000,
  });
  return {
    ...query,
    attempts: query.data?.pages.flatMap((p) => p.items) ?? [],
    summary: query.data?.pages[0]?.summary ?? null,
  };
}
