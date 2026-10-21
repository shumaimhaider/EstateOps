import { httpClient } from '@/shared/api/httpClient.js';

export const contractsRest = {
  list: (bookingId, { signal } = {}) =>
    httpClient.get('/admin/contracts', { query: { booking_id: bookingId }, signal }),
  uploadSigned: (bookingId, form, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/bookings/${bookingId}/contracts/signed`, form, { idempotencyKey }),
  createPandaDoc: (bookingId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/bookings/${bookingId}/contracts/pandadoc`, body, { idempotencyKey }),
  act: (id, action, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/contracts/${id}/${action}`, body, { idempotencyKey }),
  // Mock only: stands in for the PandaDoc webhook.
  simulate: (id, event, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/mock/contracts/${id}/events/${event}`, undefined, { idempotencyKey }),
};
