import { useQuery } from '@tanstack/react-query';
import { bookingsRepository } from '../data/bookings.repository.js';
import { bookingKeys } from './sales.keys.js';

export function useBookingQuery(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: ({ signal }) => bookingsRepository.get(id, { signal }),
    staleTime: 15_000,
    enabled,
  });
}
