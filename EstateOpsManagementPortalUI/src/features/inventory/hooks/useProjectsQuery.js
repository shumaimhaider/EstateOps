import { useQuery } from '@tanstack/react-query';
import { projectsRepository } from '../data/projects.repository.js';
import { projectKeys } from './unit.keys.js';

export function useProjectsQuery() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: ({ signal }) => projectsRepository.list({ signal }),
    select: (page) => page.items,
    staleTime: 5 * 60_000,
  });
}
