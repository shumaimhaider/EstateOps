import { httpClient } from '@/shared/api/httpClient.js';

export const bookingsRest = {
  list: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/bookings', { query: { ...filters, ...page }, signal }),
  get: (id, { signal } = {}) => httpClient.get(`/admin/bookings/${id}`, { signal }),
};
