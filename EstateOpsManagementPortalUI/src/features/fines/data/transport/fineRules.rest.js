import { httpClient } from '@/shared/api/httpClient.js';

export const fineRulesRest = {
  list: ({ signal } = {}) => httpClient.get('/admin/fine-rules', { signal }),
  effective: (params, { signal } = {}) =>
    httpClient.get('/admin/fine-rules/effective', { query: params, signal }),
  save: (body, { idempotencyKey } = {}) =>
    httpClient.put('/admin/fine-rules', body, { idempotencyKey }),
  remove: (id, { idempotencyKey } = {}) =>
    httpClient.delete(`/admin/fine-rules/${id}`, { idempotencyKey }),
};
