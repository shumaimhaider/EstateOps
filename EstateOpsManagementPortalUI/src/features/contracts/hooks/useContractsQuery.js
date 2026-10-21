import { useQuery } from '@tanstack/react-query';
import { contractsRepository } from '../data/contracts.repository.js';
import { contractKeys } from './contracts.keys.js';

/** A booking's contracts, newest version first. */
export function useContractsQuery(bookingId, { enabled = true } = {}) {
  return useQuery({
    queryKey: contractKeys.list(bookingId),
    queryFn: ({ signal }) => contractsRepository.list(bookingId, { signal }),
    staleTime: 15_000,
    enabled,
  });
}
