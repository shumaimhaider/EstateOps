import { httpClient } from '@/shared/api/httpClient.js';

export const customersRest = {
  list: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/customers', { query: { ...filters, ...page }, signal }),
  get: (id, { signal } = {}) => httpClient.get(`/admin/customers/${id}`, { signal }),
};
