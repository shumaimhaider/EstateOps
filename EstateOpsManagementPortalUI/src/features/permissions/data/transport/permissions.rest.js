import { httpClient } from '@/shared/api/httpClient.js';

export const permissionsRest = {
  list: ({ signal } = {}) => httpClient.get('/admin/permissions', { signal }),
  updateRole: (role, body, { idempotencyKey } = {}) =>
    httpClient.put(`/admin/permissions/${role}`, body, { idempotencyKey }),
};
