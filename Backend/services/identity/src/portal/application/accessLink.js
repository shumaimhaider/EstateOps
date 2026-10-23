import { newId } from '@estateops/kernel';
import { INVITE_TTL_MS, RESET_TTL_MS, expiresIn } from '../domain/account.js';
import { inviteEmail, resetEmail } from '../domain/emails.js';

/**
 * Gives an account a fresh one-time link and emails it. Older unused links stop working (only the
 * newest is valid). `purpose`: 'invite' (choose a first password) or 'reset'.
 */
export async function issueAccessLink({
  repos,
  account,
  tenant,
  purpose,
  tokens,
  now,
  mailer,
  portalUrl,
}) {
  await repos.accountTokens.closeOpen(account.id, now);
  const token = tokens.newRefreshToken();
  const ttl = purpose === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS;
  await repos.accountTokens.insert({
    id: newId(),
    tenantId: account.tenantId,
    accountId: account.id,
    purpose,
    tokenHash: tokens.hash(token),
    expiresAt: expiresIn(ttl, now),
  });
  const page = purpose === 'invite' ? 'set-password' : 'reset-password';
  const link = `${portalUrl.replace(/\/$/, '')}/${page}?token=${encodeURIComponent(token)}&tenant=${encodeURIComponent(tenant.slug)}`;
  const data = { customerName: account.fullName, developer: tenant.name, link };
  const message =
    purpose === 'invite'
      ? inviteEmail({ ...data, days: INVITE_TTL_MS / 86_400_000 })
      : resetEmail({ ...data, minutes: RESET_TTL_MS / 60_000 });
  await mailer.send({ to: account.email, ...message });
  if (purpose === 'invite') await repos.customerAccounts.markInvited(account.id, now);
  return { link };
}
