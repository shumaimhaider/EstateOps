import { useInfiniteQuery } from '@tanstack/react-query';
import { UNITS_PAGE_SIZE } from '../domain/unit.constants.js';
import { unitsRepository } from '../data/units.repository.js';
import { unitKeys } from './unit.keys.js';

/** Cursor-paginated unit list. Returns flattened `units` models plus paging helpers. */
export function useUnitsQuery(filters) {
  const query = useInfiniteQuery({
    queryKey: unitKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      unitsRepository.list(filters, { cursor: pageParam, limit: UNITS_PAGE_SIZE, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  return { ...query, units: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
