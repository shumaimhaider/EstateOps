import { describe, expect, it } from 'vitest';
import { tokenStore } from '@/shared/api/authLink.js';
import { createAuthRepository } from './auth.repository.js';

const customer = {
  id: 'c1',
  account_id: 'a1',
  name: 'Ali',
  email: 'ali@example.test',
  tenant: {
    id: 't1',
    slug: 'pk',
    name: 'Zameen',
    currency: 'PKR',
    locale: 'en-PK',
    time_zone: 'Asia/Karachi',
    area_unit: 'marla',
  },
};

describe('auth repository', () => {
  it('shares one refresh between callers that ask at the same moment (a refresh token works once)', async () => {
    tokenStore.clear();
    tokenStore.set(null, 'refresh-1');
    const calls = [];
    const http = {
      post: async (path, body) => {
        calls.push([path, body.refresh_token]);
        await new Promise((r) => setTimeout(r, 20));
        if (calls.length > 1)
          throw Object.assign(new Error('refresh token already used'), { status: 401 });
        return { access_token: 'access-2', refresh_token: 'refresh-2' };
      },
      get: async () => customer,
    };
    const repo = createAuthRepository({ http });
    const [a, b] = await Promise.all([repo.restoreSession(), repo.restoreSession()]);
    expect(calls).toEqual([['/portal/auth/refresh', 'refresh-1']]);
    expect(a.email).toBe('ali@example.test');
    expect(b.email).toBe('ali@example.test');
    expect(tokenStore.getAccess()).toBe('access-2');
    expect(tokenStore.getRefresh()).toBe('refresh-2');
    tokenStore.clear();
  });

  it('is signed out when there is no token at all', async () => {
    tokenStore.clear();
    const repo = createAuthRepository({ http: {} });
    await expect(repo.restoreSession()).rejects.toMatchObject({ status: 401 });
  });
});
