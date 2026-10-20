import { httpClient } from '@/shared/api/httpClient.js';

/** REST calls for units. Paths and query params only; returns RAW JSON. */
export const unitsRest = {
  list: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/units', { query: { ...filters, ...page }, signal }),
  get: (id, { signal } = {}) => httpClient.get(`/admin/units/${id}`, { signal }),
  create: (body, { idempotencyKey } = {}) =>
    httpClient.post('/admin/units', body, { idempotencyKey }),
  block: (id, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/units/${id}/block`, {}, { idempotencyKey }),
  unblock: (id, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/units/${id}/unblock`, {}, { idempotencyKey }),
};
