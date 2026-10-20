import { httpClient } from '@/shared/api/httpClient.js';

export const escalationsRest = {
  list: ({ page }, { signal } = {}) =>
    httpClient.get('/admin/escalations', { query: page, signal }),
  sendNotice: (id, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/escalations/${id}/notice`, {}, { idempotencyKey }),
};
