import { beforeEach, describe, expect, it } from 'vitest';
import { tokenStore } from '@/shared/api/authLink.js';
import { createAuthRepository } from './auth.repository.js';
import { authGraphql } from './transport/auth.graphql.js';
import { authRest } from './transport/auth.rest.js';

const repo = (transport) =>
  createAuthRepository({
    transports: { rest: authRest, graphql: authGraphql },
    pickTransport: () => transport,
  });

beforeEach(() => tokenStore.clear());

describe.each(['rest', 'graphql'])('auth over %s', (transport) => {
  const auth = repo(transport);

  it('signs in with password then 2FA and stores tokens', async () => {
    const { mfaToken } = await auth.login({
      email: 'finance@pk.estateops.test',
      password: 'Passw0rd!',
    });
    const session = await auth.verifyCode({ mfaToken, code: '123456' });
    expect(session.user).toMatchObject({
      role: 'finance',
      tenant: { currency: 'PKR', timeZone: 'Asia/Karachi' },
    });
    expect(tokenStore.getAccess()).toBe(session.tokens.access);
  });

  it('rejects a wrong password and a wrong 2FA code with field errors', async () => {
    await expect(
      auth.login({ email: 'finance@pk.estateops.test', password: 'nope' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    const { mfaToken } = await auth.login({
      email: 'owner@pk.estateops.test',
      password: 'Passw0rd!',
    });
    await expect(auth.verifyCode({ mfaToken, code: '000000' })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { code: expect.any(String) },
    });
    expect(tokenStore.getAccess()).toBeNull();
  });

  it('signs in with Google for registered staff only', async () => {
    const session = await auth.loginWithGoogle('mock-google:owner@ae.estateops.test');
    expect(session.user.tenant).toMatchObject({ currency: 'AED', areaUnit: 'sq_ft' });
    await expect(auth.loginWithGoogle('mock-google:stranger@gmail.com')).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_NOT_REGISTERED',
    });
  });

  it('restores a session from the refresh token alone, and signs out', async () => {
    const session = await auth.loginWithGoogle('mock-google:owner@pk.estateops.test');
    tokenStore.set(null, session.tokens.refresh); // a page reload loses the in-memory access token
    const user = await auth.restoreSession();
    expect(user.email).toBe('owner@pk.estateops.test');
    expect(tokenStore.getAccess()).toBeTruthy();

    await auth.logout();
    expect(tokenStore.getAccess()).toBeNull();
    await expect(auth.restoreSession()).rejects.toMatchObject({ status: 401 });
  });

  it('lists the seeded dev accounts: one user per role per tenant', async () => {
    const accounts = await auth.devAccounts();
    expect(accounts).toHaveLength(20);
    expect(new Set(accounts.map((a) => a.role)).size).toBe(10);
  });
});
