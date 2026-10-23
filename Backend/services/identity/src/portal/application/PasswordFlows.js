import { NotFoundError, UnauthenticatedError, ValidationError, newId } from '@estateops/kernel';
import {
  MAX_LINKS_PER_HOUR,
  assertPasswordPolicy,
  isExpired,
  linkPurposeFor,
  normalizeEmail,
} from '../domain/account.js';
import { passwordChangedEmail } from '../domain/emails.js';
import { issueAccessLink } from './accessLink.js';

const badLink = () =>
  new ValidationError('This link is no longer valid', [
    { field: 'token', message: 'This link has expired or was already used. Ask for a new one.' },
  ]);

/**
 * "I forgot my password". Always answers the same, whether or not the address has an account, so
 * it cannot be used to find out who is a customer. A real account gets a one-time link by email,
 * at most three an hour, and an invited account that never set a password gets its invitation again.
 */
export class ForgotPassword {
  constructor({ uow, clock, tokens, mailer, portalUrl, throttle = null }) {
    Object.assign(this, { uow, clock, tokens, mailer, portalUrl, throttle });
  }

  async execute({ tenantSlug, email, ip }) {
    const address = normalizeEmail(email);
    const who = { email: `${String(tenantSlug ?? '').toLowerCase()}:${address}`, ip };
    await this.throttle?.assertAllowed(who);
    await this.throttle?.failed(who); // every request counts, found or not
    const now = this.clock.now();
    await this.uow.run(async (repos) => {
      const tenant = await repos.tenants.findBySlug(String(tenantSlug ?? '').toLowerCase());
      const account = tenant && (await repos.customerAccounts.findByEmail(tenant.id, address));
      if (!account || account.status === 'disabled') return;
      const recent = await repos.accountTokens.countSince(
        account.id,
        new Date(now.getTime() - 60 * 60_000),
      );
      if (recent >= MAX_LINKS_PER_HOUR) return;
      await repos.customerLogins.record({
        id: newId(),
        tenantId: tenant.id,
        accountId: account.id,
        event: 'reset_requested',
        ip,
      });
      await issueAccessLink({
        repos,
        account,
        tenant,
        purpose: linkPurposeFor(account),
        tokens: this.tokens,
        now,
        mailer: this.mailer,
        portalUrl: this.portalUrl,
      });
    });
    return { accepted: true };
  }
}

/**
 * Chooses a password from an invitation or reset link. The link works once; the password must meet
 * the policy; every signed-in device is signed out, and the customer is told by email.
 */
export class SetPassword {
  constructor({ uow, clock, tokens, hasher, mailer }) {
    Object.assign(this, { uow, clock, tokens, hasher, mailer });
  }

  async execute({ token, password, ip }) {
    assertPasswordPolicy(password);
    const now = this.clock.now();
    const hash = this.tokens.hash(String(token ?? ''));
    const passwordHash = await this.hasher.hash(password);
    return this.uow.run(async (repos) => {
      const link = await repos.accountTokens.findByHash(hash);
      if (!link || link.usedAt || isExpired(link.expiresAt, now)) throw badLink();
      if (!(await repos.accountTokens.markUsed(link.id, now))) throw badLink();
      const account = await repos.customerAccounts.findById(link.tenantId, link.accountId, {
        lock: true,
      });
      if (!account || account.status === 'disabled') throw badLink();
      await repos.customerAccounts.setPassword(account.id, passwordHash, now);
      await repos.accountTokens.closeOpen(account.id, now);
      await repos.customerRefreshTokens.revokeAllForAccount(account.id);
      await repos.customerLogins.record({
        id: newId(),
        tenantId: account.tenantId,
        accountId: account.id,
        event: 'password_set',
        ip,
      });
      const tenant = await repos.tenants.findById(account.tenantId);
      await this.mailer.send({
        to: account.email,
        ...passwordChangedEmail({ customerName: account.fullName, developer: tenant.name }),
      });
      return { tenantSlug: tenant.slug, email: account.email };
    });
  }
}

/** A signed-in customer changes their own password; every other session is ended. */
export class ChangePassword {
  constructor({ uow, clock, tokens, hasher, mailer }) {
    Object.assign(this, { uow, clock, tokens, hasher, mailer });
  }

  async execute({ customer, currentPassword, newPassword, ip }) {
    assertPasswordPolicy(newPassword, 'new_password');
    const now = this.clock.now();
    const newHash = await this.hasher.hash(newPassword);
    return this.uow.run(async (repos) => {
      const account = await repos.customerAccounts.findById(customer.tenantId, customer.accountId, {
        lock: true,
      });
      if (!account || account.status !== 'active') throw new NotFoundError('Account not found');
      if (!(await this.hasher.verify(String(currentPassword ?? ''), account.passwordHash))) {
        throw new UnauthenticatedError('INVALID_CREDENTIALS', 'Your current password is incorrect');
      }
      if (await this.hasher.verify(newPassword, account.passwordHash)) {
        throw new ValidationError('The password was not changed', [
          { field: 'new_password', message: 'Choose a password you have not used just now' },
        ]);
      }
      await repos.customerAccounts.setPassword(account.id, newHash, now);
      await repos.customerRefreshTokens.revokeAllForAccount(account.id);
      await repos.customerLogins.record({
        id: newId(),
        tenantId: account.tenantId,
        accountId: account.id,
        event: 'password_changed',
        ip,
      });
      const tenant = await repos.tenants.findById(account.tenantId);
      await this.mailer.send({
        to: account.email,
        ...passwordChangedEmail({ customerName: account.fullName, developer: tenant.name }),
      });
      return { ok: true };
    });
  }
}
