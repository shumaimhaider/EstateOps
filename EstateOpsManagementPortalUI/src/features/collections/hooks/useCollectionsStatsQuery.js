import { useQuery } from '@tanstack/react-query';
import { statsRepository } from '../data/stats.repository.js';
import { statsKeys } from './collections.keys.js';

/** Collections statistics for all projects (no projectId) or one project. */
export function useCollectionsStatsQuery({ projectId = '' } = {}) {
  return useQuery({
    queryKey: statsKeys.collections({ projectId }),
    queryFn: ({ signal }) => statsRepository.collections({ projectId }, { signal }),
    staleTime: 30_000,
  });
}
