import { httpClient } from '@/shared/api/httpClient.js';

export const authRest = {
  login: (body) => httpClient.post('/admin/auth/login', body),
  verify: (body) => httpClient.post('/admin/auth/2fa', body),
  google: (body) => httpClient.post('/admin/auth/google', body),
  refresh: (body) => httpClient.post('/admin/auth/refresh', body),
  logout: (body = {}) => httpClient.post('/admin/auth/logout', body),
  me: ({ signal } = {}) => httpClient.get('/admin/auth/me', { signal }),
};
