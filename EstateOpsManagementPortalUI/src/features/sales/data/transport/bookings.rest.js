import { httpClient } from '@/shared/api/httpClient.js';

export const bookingsRest = {
  list: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/bookings', { query: { ...filters, ...page }, signal }),
  get: (id, { signal } = {}) => httpClient.get(`/admin/bookings/${id}`, { signal }),
  create: (body, { idempotencyKey } = {}) =>
    httpClient.post('/admin/bookings', body, { idempotencyKey }),
  // what the new-booking form offers to choose from
  searchUnits: ({ q }, { signal } = {}) =>
    httpClient.get('/admin/units', { query: { status: 'available', q, limit: 25 }, signal }),
  searchCustomers: ({ q }, { signal } = {}) =>
    httpClient.get('/admin/customers', { query: { q, limit: 25 }, signal }),
  listPlans: ({ signal } = {}) =>
    httpClient.get('/admin/payment-plans', { query: { limit: 100 }, signal }),
};
