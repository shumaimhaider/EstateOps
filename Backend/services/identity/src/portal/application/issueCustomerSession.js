import { newId } from '@estateops/kernel';
import { PORTAL_REFRESH_TTL_MS, expiresIn } from '../domain/account.js';

/** An access token for the customer portal (kind 'customer') and a new single-use refresh token. */
export async function issueCustomerSession({ repos, account, tenant, signer, tokens, now }) {
  const accessToken = await signer.sign({
    sub: account.id,
    tenantId: account.tenantId,
    customerId: account.customerId,
    role: 'customer',
    name: account.fullName,
    permissions: [],
    kind: 'customer',
  });
  const refresh = tokens.newRefreshToken();
  await repos.customerRefreshTokens.insert({
    id: newId(),
    tenantId: account.tenantId,
    accountId: account.id,
    tokenHash: tokens.hash(refresh),
    expiresAt: expiresIn(PORTAL_REFRESH_TTL_MS, now),
  });
  return { accessToken, refreshToken: refresh, account, tenant };
}
