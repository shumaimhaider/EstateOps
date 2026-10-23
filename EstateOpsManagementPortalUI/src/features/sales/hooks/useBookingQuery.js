import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';
import { bookingsRepository } from '../data/bookings.repository.js';
import { bookingKeys } from './sales.keys.js';

/** Statuses a booking passes through while the server reserves the unit and makes the schedule. */
const SETTING_UP = ['requested', 'in_review', 'confirmed'];

/**
 * One booking. While it is still being set up (a few seconds after it is created) it is asked
 * again every 2 seconds, and when it becomes active everything that depends on its invoices
 * is refreshed.
 */
export function useBookingQuery(id, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: ({ signal }) => bookingsRepository.get(id, { signal }),
    staleTime: 15_000,
    enabled,
    refetchInterval: (q) => (SETTING_UP.includes(q.state.data?.status) ? 2_000 : false),
  });
  const status = query.data?.status;
  const previous = useRef(status);
  useEffect(() => {
    if (SETTING_UP.includes(previous.current) && !SETTING_UP.includes(status)) {
      for (const root of [
        QUERY_ROOTS.invoices,
        QUERY_ROOTS.units,
        QUERY_ROOTS.customers,
        QUERY_ROOTS.stats,
      ]) {
        queryClient.invalidateQueries({ queryKey: root });
      }
    }
    previous.current = status;
  }, [status, queryClient]);
  return { ...query, settingUp: SETTING_UP.includes(status) };
}
