import { httpClient } from '@/shared/api/httpClient.js';

export const installmentsRest = {
  list: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/installments', { query: { ...filters, ...page }, signal }),
  pay: (id, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/installments/${id}/pay`, body, { idempotencyKey }),
};
