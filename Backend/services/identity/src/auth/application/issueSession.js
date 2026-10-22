import { ALL_PERMISSIONS, LOCKED_ROLES } from '@estateops/kernel';
import { REFRESH_TTL_MS, expiresIn } from '../domain/session.js';

/**
 * Issues an access token (permissions as claims) and a new single-use refresh token for a user.
 * Shared by two-factor sign-in and refresh. Runs inside the caller's unit of work.
 */
export async function issueSession({ repos, user, tenant, signer, tokens, now }) {
  const permissions = LOCKED_ROLES.includes(user.role)
    ? ALL_PERMISSIONS
    : await repos.rolePermissions.get(user.tenantId, user.role);
  const accessToken = await signer.sign({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
    permissions,
  });
  const refresh = tokens.newRefreshToken();
  await repos.refreshTokens.insert({
    id: tokens.newId(),
    tenantId: user.tenantId,
    userId: user.id,
    tokenHash: tokens.hash(refresh),
    expiresAt: expiresIn(REFRESH_TTL_MS, now),
  });
  return { accessToken, refreshToken: refresh, user: { ...user, permissions }, tenant };
}
