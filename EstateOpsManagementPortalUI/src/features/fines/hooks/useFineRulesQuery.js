import { useQuery } from '@tanstack/react-query';
import { fineRulesRepository } from '../data/fineRules.repository.js';
import { fineKeys } from './fines.keys.js';

/** Every configured fine rate: the default and each project, property and customer override. */
export function useFineRulesQuery() {
  return useQuery({
    queryKey: fineKeys.list(),
    queryFn: ({ signal }) => fineRulesRepository.list({ signal }),
    staleTime: 30_000,
  });
}
