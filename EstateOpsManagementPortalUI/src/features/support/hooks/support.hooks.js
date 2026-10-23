import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { supportRepository } from '../data/support.repository.js';

export const supportKeys = {
  all: ['support'],
  list: (filters) => [...supportKeys.all, 'list', filters],
  detail: (id) => [...supportKeys.all, 'detail', id],
  access: (customerId) => ['customers', 'portal-access', customerId],
};

const PAGE = 25;

/** The support queue, newest activity first. `waiting` counts requests staff still owe an answer. */
export function useSupportQueueQuery(filters = {}) {
  const query = useInfiniteQuery({
    queryKey: supportKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      supportRepository.list({ ...filters, cursor: pageParam, limit: PAGE }, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  return {
    ...query,
    requests: query.data?.pages.flatMap((p) => p.items) ?? [],
    waiting: query.data?.pages[0]?.waiting ?? 0,
  };
}

/** Just the number waiting, for the navigation badge. */
export function useSupportWaitingQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...supportKeys.all, 'waiting'],
    queryFn: async ({ signal }) =>
      (await supportRepository.list({ status: 'open', limit: 1 }, { signal })).waiting,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export const useSupportThreadQuery = (id) =>
  useQuery({
    queryKey: supportKeys.detail(id),
    queryFn: ({ signal }) => supportRepository.get(id, { signal }),
    enabled: Boolean(id),
  });

function useThreadMutation(run) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables) => run(variables, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: (thread) => {
      queryClient.setQueryData(supportKeys.detail(thread.id), thread);
      return queryClient.invalidateQueries({ queryKey: [...supportKeys.all, 'list'] });
    },
  });
}

/** variables: { id, message } */
export const useReplyMutation = () =>
  useThreadMutation(({ id, message }, o) => supportRepository.reply(id, message, o));
/** variables: { id, action: 'close' | 'reopen' } */
export const useSupportStatusMutation = () =>
  useThreadMutation(({ id, action }, o) => supportRepository.setStatus(id, action, o));

export const usePortalAccessQuery = (customerId, { enabled = true } = {}) =>
  useQuery({
    queryKey: supportKeys.access(customerId),
    queryFn: ({ signal }) => supportRepository.portalAccess(customerId, { signal }),
    enabled: Boolean(customerId) && enabled,
  });

function useAccessMutation(run, customerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables) => run(variables, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.access(customerId) }),
  });
}
export const useSendLinkMutation = (customerId) =>
  useAccessMutation((_v, o) => supportRepository.sendLink(customerId, o), customerId);
/** variables: boolean (true = switch on) */
export const useSetAccessMutation = (customerId) =>
  useAccessMutation(
    (enabled, o) => supportRepository.setAccess(customerId, enabled, o),
    customerId,
  );
