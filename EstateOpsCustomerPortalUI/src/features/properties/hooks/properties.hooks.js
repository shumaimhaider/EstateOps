import { useQuery } from '@tanstack/react-query';
import { QUERY_ROOTS } from '@/shared/lib/queryRoots.js';
import { propertiesRepository } from '../data/properties.repository.js';

export const propertyKeys = {
  all: QUERY_ROOTS.properties,
  list: () => [...QUERY_ROOTS.properties, 'list'],
  detail: (id) => [...QUERY_ROOTS.properties, 'detail', id],
  invoices: (id) => [...QUERY_ROOTS.invoices, id],
};

export const usePropertiesQuery = () =>
  useQuery({
    queryKey: propertyKeys.list(),
    queryFn: ({ signal }) => propertiesRepository.list({ signal }),
    staleTime: 30_000,
  });

export const usePropertyQuery = (id) =>
  useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: ({ signal }) => propertiesRepository.get(id, { signal }),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

/** A property's whole payment schedule, down payment first. */
export const useInvoicesQuery = (id) =>
  useQuery({
    queryKey: propertyKeys.invoices(id),
    queryFn: ({ signal }) => propertiesRepository.invoices(id, { signal }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
