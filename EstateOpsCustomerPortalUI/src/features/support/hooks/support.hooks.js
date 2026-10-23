import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportRepository as repo } from '../data/support.repository.js';

export const supportKeys = {
  all: ['support'],
  list: () => ['support', 'list'],
  one: (id) => ['support', 'one', id],
};

export function useRequestsQuery() {
  const query = useInfiniteQuery({
    queryKey: supportKeys.list(),
    queryFn: ({ pageParam, signal }) => repo.list({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { ...query, requests: query.data?.pages.flatMap((p) => p.items) ?? [] };
}

export const useThreadQuery = (id) =>
  useQuery({
    queryKey: supportKeys.one(id),
    queryFn: ({ signal }) => repo.get(id, { signal }),
    enabled: Boolean(id),
  });

export function useCreateRequestMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input) => repo.create(input),
    onSuccess: (thread) => {
      client.setQueryData(supportKeys.one(thread.id), thread);
      return client.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}

export function useReplyMutation(id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message) => repo.reply(id, message),
    onSuccess: (thread) => {
      client.setQueryData(supportKeys.one(id), thread);
      return client.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}
