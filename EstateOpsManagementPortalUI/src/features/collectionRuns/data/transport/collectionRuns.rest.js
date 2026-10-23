import { httpClient } from '@/shared/api/httpClient.js';

/** REST calls for the collection history. Paths and query params only; returns RAW JSON. */
export const collectionRunsRest = {
  listDays: ({ before, limit }, { signal } = {}) =>
    httpClient.get('/admin/collection-runs', { query: { before, limit }, signal }),
  listAttempts: (date, query, { signal } = {}) =>
    httpClient.get(`/admin/collection-runs/${date}`, { query, signal }),
};
