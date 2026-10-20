import { useMemo } from 'react';
import { useUrlFilters } from '@/shared/lib/useUrlFilters.js';
import { BOOKING_SORT_FIELDS } from '../domain/booking.constants.js';

const KEYS = {
  search: 'q',
  status: 'status',
  kind: 'kind',
  projectId: 'project',
  escalated: 'escalated',
};

export function useBookingFilters() {
  const { filters, setFilters } = useUrlFilters({ keys: KEYS, sortFields: BOOKING_SORT_FIELDS });
  const typed = useMemo(() => ({ ...filters, escalated: filters.escalated === 'true' }), [filters]);
  return {
    filters: typed,
    setFilters: (patch) =>
      setFilters(
        'escalated' in patch ? { ...patch, escalated: patch.escalated ? 'true' : '' } : patch,
      ),
  };
}
