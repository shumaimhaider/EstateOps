import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MONEY_ROOTS } from '@/shared/lib/queryRoots.js';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { bookingsRepository } from '../data/bookings.repository.js';
import { bookingKeys } from './sales.keys.js';

/** Available units matching the typed text (all of them, newest first, when empty). */
export const useUnitChoices = (q) =>
  useQuery({
    queryKey: [...bookingKeys.all, 'choices', 'units', q],
    queryFn: ({ signal }) => bookingsRepository.searchUnits(q, { signal }),
    staleTime: 10_000,
  });

export const useCustomerChoices = (q) =>
  useQuery({
    queryKey: [...bookingKeys.all, 'choices', 'customers', q],
    queryFn: ({ signal }) => bookingsRepository.searchCustomers(q, { signal }),
    staleTime: 10_000,
  });

export const usePlanChoices = () =>
  useQuery({
    queryKey: [...bookingKeys.all, 'choices', 'plans'],
    queryFn: ({ signal }) => bookingsRepository.listPlans({ signal }),
    staleTime: 60_000,
  });

/** variables: { unitId, customerId, planId, bookedAt? }. One idempotency key per submit, reused on retry. */
export function useCreateBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) =>
      bookingsRepository.create(values, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () =>
      Promise.all(
        [bookingKeys.all, ...MONEY_ROOTS].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
