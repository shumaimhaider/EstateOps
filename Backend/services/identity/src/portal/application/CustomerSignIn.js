import { NotFoundError, UnauthenticatedError, newId } from '@estateops/kernel';
import { canSignIn, isExpired, normalizeEmail } from '../domain/account.js';
import { issueCustomerSession } from './issueCustomerSession.js';

const invalid = () =>
  new UnauthenticatedError('INVALID_CREDENTIALS', 'Email or password is incorrect');
const expired = () => new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'Session expired');

/**
 * Customer sign-in: the developer (tenant slug), email and password. Wrong credentials never say
 * which part was wrong, and an unknown address costs the same as a wrong password. An account
 * that is invited (no password yet) or disabled cannot sign in. Guessing is slowed by the
 * Redis-backed throttle before any work is done.
 */
export class CustomerLogin {
  constructor({ uow, hasher, tokens, signer, clock, throttle = null }) {
    Object.assign(this, { uow, hasher, tokens, signer, clock, throttle });
  }

  async execute({ tenantSlug, email, password, ip }) {
    const who = { email: `${String(tenantSlug ?? '').toLowerCase()}:${normalizeEmail(email)}`, ip };
    await this.throttle?.assertAllowed(who);
    try {
      const session = await this.#signIn({
        tenantSlug,
        email: normalizeEmail(email),
        password,
        ip,
      });
      await this.throttle?.succeeded(who);
      return session;
    } catch (error) {
      if (error?.code === 'INVALID_CREDENTIALS') await this.throttle?.failed(who);
      throw error;
    }
  }

  async #signIn({ tenantSlug, email, password, ip }) {
    const now = this.clock.now();
    const tenant = await this.uow.read((repos) =>
      repos.tenants.findBySlug(String(tenantSlug ?? '').toLowerCase()),
    );
    const account =
      tenant &&
      (await this.uow.read((repos) => repos.customerAccounts.findByEmail(tenant.id, email)));
    const hash = account?.passwordHash ?? this.hasher.dummyHash;
    const good = await this.hasher.verify(String(password ?? ''), hash);
    if (!account || !good || !canSignIn(account)) {
      if (account) {
        await this.uow.run((repos) =>
          repos.customerLogins.record({
            id: newId(),
            tenantId: tenant.id,
            accountId: account.id,
            event: 'login_failed',
            ip,
          }),
        );
      }
      throw invalid();
    }
    return this.uow.run(async (repos) => {
      await repos.customerAccounts.touchLogin(account.id, now);
      await repos.customerLogins.record({
        id: newId(),
        tenantId: tenant.id,
        accountId: account.id,
        event: 'login',
        ip,
      });
      return issueCustomerSession({
        repos,
        account,
        tenant,
        signer: this.signer,
        tokens: this.tokens,
        now,
      });
    });
  }
}

/** Trades a refresh token for a new pair. Each works once; reuse means it leaked, so all sessions end. */
export class CustomerRefresh {
  constructor({ uow, signer, tokens, clock }) {
    Object.assign(this, { uow, signer, tokens, clock });
  }

  async execute({ refreshToken }) {
    const now = this.clock.now();
    const hash = this.tokens.hash(String(refreshToken ?? ''));
    const found = await this.uow.read((repos) => repos.customerRefreshTokens.findByHash(hash));
    if (!found || isExpired(found.expiresAt, now)) throw expired();
    if (found.usedAt) {
      await this.uow.run((repos) =>
        repos.customerRefreshTokens.revokeAllForAccount(found.accountId),
      );
      throw expired();
    }
    return this.uow.run(async (repos) => {
      if (!(await repos.customerRefreshTokens.markUsed(found.id, now))) throw expired();
      const account = await repos.customerAccounts.findById(found.tenantId, found.accountId);
      if (!account || !canSignIn(account)) throw expired();
      const tenant = await repos.tenants.findById(account.tenantId);
      const session = await issueCustomerSession({
        repos,
        account,
        tenant,
        signer: this.signer,
        tokens: this.tokens,
        now,
      });
      return { accessToken: session.accessToken, refreshToken: session.refreshToken };
    });
  }
}

export class CustomerLogout {
  constructor({ uow, tokens }) {
    Object.assign(this, { uow, tokens });
  }

  async execute({ refreshToken }) {
    if (!refreshToken) return;
    await this.uow.run((repos) =>
      repos.customerRefreshTokens.revokeByHash(this.tokens.hash(String(refreshToken))),
    );
  }
}

/** The signed-in customer's account and developer, for the portal's header and formats. */
export class GetPortalMe {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer }) {
    return this.uow.read(async (repos) => {
      const account = await repos.customerAccounts.findById(customer.tenantId, customer.accountId);
      if (!account || !canSignIn(account)) throw new NotFoundError('Account not found');
      return { account, tenant: await repos.tenants.findById(account.tenantId) };
    });
  }
}
