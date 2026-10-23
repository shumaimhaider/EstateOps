import { isEmail, newId, validator } from '@estateops/kernel';
import { assertPasswordPolicy, normalizeEmail } from '../../users/domain/user.js';

export { assertPasswordPolicy, normalizeEmail };

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
export const RESET_TTL_MS = 60 * 60_000;
export const PORTAL_REFRESH_TTL_MS = 14 * 24 * 60 * 60_000;
export const MAX_LINKS_PER_HOUR = 3;

/** A portal account for a customer the management portal made. It has no password until they choose one. */
export function createInvitedAccount(
  { tenantId, customerId, email, fullName },
  { id = newId(), now },
) {
  const v = validator('The portal account could not be created');
  v.check(isEmail(normalizeEmail(email)), 'email', 'Enter a valid email address');
  v.done();
  return {
    id,
    tenantId,
    customerId,
    email: normalizeEmail(email),
    fullName: String(fullName ?? '').trim() || normalizeEmail(email),
    passwordHash: null,
    status: 'invited',
    invitedAt: now,
    lastLoginAt: null,
    passwordChangedAt: null,
  };
}

/** Only an active account with a password may sign in. */
export const canSignIn = (account) => account.status === 'active' && Boolean(account.passwordHash);

/** Which kind of link an account needs next: a first password, or a reset. */
export const linkPurposeFor = (account) => (account.passwordHash ? 'reset' : 'invite');

export const isExpired = (at, now) => new Date(at).getTime() <= now.getTime();
export const expiresIn = (ms, now) => new Date(now.getTime() + ms);
