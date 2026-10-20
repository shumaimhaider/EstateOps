import { httpClient } from '@/shared/api/httpClient.js';

export const authRest = {
  login: (body) => httpClient.post('/auth/login', body),
  verify: (body) => httpClient.post('/auth/2fa', body),
  google: (body) => httpClient.post('/auth/google', body),
  refresh: (body) => httpClient.post('/auth/refresh', body),
  logout: () => httpClient.post('/auth/logout', {}),
  me: ({ signal } = {}) => httpClient.get('/auth/me', { signal }),
  devAccounts: async () => (await httpClient.get('/auth/dev-accounts')).data,
};
