import { useQuery } from '@tanstack/react-query';
import { unitsRepository } from '../data/units.repository.js';
import { unitKeys } from './unit.keys.js';

export function useUnitQuery(id) {
  return useQuery({
    queryKey: unitKeys.detail(id),
    queryFn: ({ signal }) => unitsRepository.get(id, { signal }),
    staleTime: 15_000,
  });
}
