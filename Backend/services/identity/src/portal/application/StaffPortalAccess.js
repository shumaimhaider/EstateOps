import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { MAX_LINKS_PER_HOUR, linkPurposeFor } from '../domain/account.js';
import { issueAccessLink } from './accessLink.js';

const view = (a) => ({
  customerId: a.customerId,
  email: a.email,
  status: a.status,
  invitedAt: a.invitedAt,
  lastLoginAt: a.lastLoginAt,
  hasPassword: Boolean(a.passwordHash),
});

/** Whether a customer has a portal account, and its state. Needs customers.view. */
export class GetPortalAccess {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, customerId }) {
    assertCan(actor, PERMISSION.CUSTOMERS_VIEW);
    const account = await this.uow.read((repos) =>
      repos.customerAccounts.findByCustomer(actor.tenantId, customerId),
    );
    return account ? view(account) : null;
  }
}

/** Staff send (or send again) the customer's invitation, or a reset link once they have a password. Needs customers.manage. */
export class SendAccessLink {
  constructor({ uow, clock, tokens, mailer, portalUrl }) {
    Object.assign(this, { uow, clock, tokens, mailer, portalUrl });
  }

  async execute({ actor, customerId }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const account = await repos.customerAccounts.findByCustomer(actor.tenantId, customerId, {
        lock: true,
      });
      if (!account)
        throw new NotFoundError('This customer has no portal account (add an email address first)');
      if (account.status === 'disabled')
        throw new ConflictError(
          'PORTAL_DISABLED',
          'Portal access is switched off for this customer',
        );
      if (
        (await repos.accountTokens.countSince(account.id, new Date(now.getTime() - 60 * 60_000))) >=
        MAX_LINKS_PER_HOUR
      ) {
        throw new ConflictError(
          'TOO_MANY_LINKS',
          'A link was sent a few times already. Try again in an hour.',
        );
      }
      const tenant = await repos.tenants.findById(actor.tenantId);
      const purpose = linkPurposeFor(account);
      await issueAccessLink({
        repos,
        account,
        tenant,
        purpose,
        tokens: this.tokens,
        now,
        mailer: this.mailer,
        portalUrl: this.portalUrl,
      });
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'portal.link_sent',
        subjectType: 'customer',
        subjectId: customerId,
        after: { purpose },
      });
      return { purpose, ...view(account) };
    });
  }
}

/** Switch a customer's portal access off (and end their sessions) or back on. Needs customers.manage. */
export class SetPortalAccess {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, customerId, enabled }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    return this.uow.run(async (repos) => {
      const account = await repos.customerAccounts.findByCustomer(actor.tenantId, customerId, {
        lock: true,
      });
      if (!account) throw new NotFoundError('This customer has no portal account');
      const next = enabled ? (account.passwordHash ? 'active' : 'invited') : 'disabled';
      if (account.status !== next) {
        await repos.customerAccounts.setStatus(account.id, next);
        if (!enabled) await repos.customerRefreshTokens.revokeAllForAccount(account.id);
        await repos.audit.record({
          tenantId: actor.tenantId,
          actor,
          action: enabled ? 'portal.enable' : 'portal.disable',
          subjectType: 'customer',
          subjectId: customerId,
          before: { status: account.status },
          after: { status: next },
        });
      }
      return view({ ...account, status: next });
    });
  }
}
