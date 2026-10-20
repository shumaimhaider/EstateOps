import { useQuery } from '@tanstack/react-query';
import { projectsRepository } from '../data/projects.repository.js';
import { projectKeys } from './unit.keys.js';

/** Site plan; refetches every 15 s so shape colours follow live unit status. */
export function useProjectMapQuery(id) {
  return useQuery({
    queryKey: [...projectKeys.all, 'map', id],
    queryFn: ({ signal }) => projectsRepository.map(id, { signal }),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
