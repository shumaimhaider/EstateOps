import { useQuery } from '@tanstack/react-query';
import { customersRepository } from '../data/customers.repository.js';
import { customerKeys } from './customer.keys.js';

export function useCustomerQuery(id) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: ({ signal }) => customersRepository.get(id, { signal }),
    staleTime: 15_000,
  });
}
