import { useUrlFilters } from '@/shared/lib/useUrlFilters.js';
import { UNIT_SORT_FIELDS } from '../domain/unit.constants.js';

const KEYS = { search: 'q', status: 'status', kind: 'kind', projectId: 'project' };

/** Unit list filters kept in the URL. */
export function useUnitFilters() {
  return useUrlFilters({ keys: KEYS, sortFields: UNIT_SORT_FIELDS });
}
