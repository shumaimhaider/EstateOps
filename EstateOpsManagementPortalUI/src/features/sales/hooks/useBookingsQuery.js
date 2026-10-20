import { useInfiniteQuery } from '@tanstack/react-query';
import { BOOKINGS_PAGE_SIZE } from '../domain/booking.constants.js';
import { bookingsRepository } from '../data/bookings.repository.js';
import { bookingKeys } from './sales.keys.js';

export function useBookingsQuery(filters, { enabled = true } = {}) {
  const query = useInfiniteQuery({
    queryKey: bookingKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      bookingsRepository.list(filters, { cursor: pageParam, limit: BOOKINGS_PAGE_SIZE, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    enabled,
  });
  return { ...query, bookings: query.data?.pages.flatMap((p) => p.items) ?? [] };
}
