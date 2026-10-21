import { useQuery } from '@tanstack/react-query';
import { fineRulesRepository } from '../data/fineRules.repository.js';
import { fineKeys } from './fines.keys.js';

/**
 * The rate that applies at a level (default, project, unit or customer) after inheritance,
 * optionally for one unit category (plot, flat, villa, shop).
 */
export function useEffectiveFineRuleQuery({ scope, scopeId, unitKind }) {
  return useQuery({
    queryKey: fineKeys.effective(scope, scopeId, unitKind),
    queryFn: ({ signal }) =>
      fineRulesRepository.effective({ scope, scopeId, unitKind }, { signal }),
    staleTime: 30_000,
  });
}
