import { useQuery } from '@tanstack/react-query';
import { projectsRepository } from '../data/projects.repository.js';
import { projectKeys } from './unit.keys.js';

export function useProjectQuery(id) {
  return useQuery({
    queryKey: [...projectKeys.all, 'detail', id],
    queryFn: ({ signal }) => projectsRepository.get(id, { signal }),
    staleTime: 30_000,
  });
}
