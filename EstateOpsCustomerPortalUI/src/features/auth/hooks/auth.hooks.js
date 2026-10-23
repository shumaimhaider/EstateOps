import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';
import { authRepository } from '../data/auth.repository.js';
import { rememberTenant } from '../domain/auth.constants.js';

/** The signed-in customer (the session). Rejects with 401, which sends the guard to the sign-in page. */
export function useSessionQuery() {
  return useQuery({
    queryKey: QUERY_ROOTS.session,
    queryFn: ({ signal }) => authRepository.restoreSession({ signal }),
    staleTime: Infinity,
    retry: false,
  });
}
export const useCurrentCustomer = () => useSessionQuery().data;

/** Wires refresh-on-401; if refresh fails the session is dropped and the guard sends the customer to sign in. */
export function useBindAuthLink() {
  const queryClient = useQueryClient();
  useEffect(() => {
    authRepository.attachAuthLink({
      onFailure: () => queryClient.invalidateQueries({ queryKey: QUERY_ROOTS.session }),
    });
  }, [queryClient]);
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => authRepository.login(credentials),
    onSuccess: (customer) => {
      rememberTenant(customer.tenant.slug);
      queryClient.setQueryData(QUERY_ROOTS.session, customer);
    },
  });
}

/** Signed out: nothing from the last customer may linger, and the guard must see the session end. */
function dropSession(queryClient) {
  queryClient.setQueryData(QUERY_ROOTS.session, null);
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== QUERY_ROOTS.session[0] });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authRepository.logout(),
    onSettled: () => {
      dropSession(queryClient);
    },
  });
}

export const useForgotPasswordMutation = () =>
  useMutation({ mutationFn: (input) => authRepository.forgotPassword(input) });
export const useSetPasswordMutation = () =>
  useMutation({ mutationFn: (input) => authRepository.setPassword(input) });

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => authRepository.changePassword(input),
    // signed out everywhere, this device included: the guard sends them to sign in with the new password
    onSuccess: () => {
      dropSession(queryClient);
    },
  });
}

export function useProfileQuery() {
  return useQuery({
    queryKey: [...QUERY_ROOTS.session, 'profile'],
    queryFn: ({ signal }) => authRepository.profile({ signal }),
    staleTime: 60_000,
  });
}
