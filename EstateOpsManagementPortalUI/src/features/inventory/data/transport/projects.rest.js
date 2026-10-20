import { httpClient } from '@/shared/api/httpClient.js';

export const projectsRest = {
  list: ({ page }, { signal } = {}) => httpClient.get('/admin/projects', { query: page, signal }),
  get: (id, { signal } = {}) => httpClient.get(`/admin/projects/${id}`, { signal }),
  map: (id, { signal } = {}) => httpClient.get(`/admin/projects/${id}/map`, { signal }),
};
