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
  startSigning: (id, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/contracts/${id}/signing-session`, {}, { idempotencyKey }),
};
