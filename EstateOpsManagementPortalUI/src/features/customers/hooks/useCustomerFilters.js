import { useMemo } from 'react';
import { useUrlFilters } from '@/shared/lib/useUrlFilters.js';
import { CUSTOMER_SORT_FIELDS } from '../domain/customer.constants.js';

const KEYS = { search: 'q', hasOverdue: 'overdue' };

export function useCustomerFilters() {
  const { filters, setFilters } = useUrlFilters({ keys: KEYS, sortFields: CUSTOMER_SORT_FIELDS });
  const typed = useMemo(
    () => ({ ...filters, hasOverdue: filters.hasOverdue === 'true' }),
    [filters],
  );
  return {
    filters: typed,
    setFilters: (patch) =>
      setFilters(
        'hasOverdue' in patch ? { ...patch, hasOverdue: patch.hasOverdue ? 'true' : '' } : patch,
      ),
  };
}
