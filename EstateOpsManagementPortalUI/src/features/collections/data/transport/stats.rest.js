import { httpClient } from '@/shared/api/httpClient.js';

export const statsRest = {
  collections: (filters, { signal } = {}) =>
    httpClient.get('/admin/stats/collections', { query: filters, signal }),
};
