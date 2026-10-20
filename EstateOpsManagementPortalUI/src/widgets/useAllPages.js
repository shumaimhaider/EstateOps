import { useEffect } from 'react';

/** Keeps fetching pages of an infinite query until the list is complete (for small, bounded lists). */
export function useAllPages(query) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
}
