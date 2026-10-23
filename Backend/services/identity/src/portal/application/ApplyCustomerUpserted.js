import { ConflictError, consumeOnce } from '@estateops/kernel';
import { createInvitedAccount, normalizeEmail } from '../domain/account.js';
import { issueAccessLink } from './accessLink.js';

const SYSTEM = { userId: null, name: 'System' };

/**
 * Event customer.upserted (the management portal created or changed a customer). A customer with
 * an email gets a portal account and an invitation to choose a password; later changes keep the
 * account's name and sign-in email in step. A customer with no email has no account yet. An email
 * another customer already uses for the portal is refused and audited, never silently shared.
 */
export class ApplyCustomerUpserted {
  constructor({ uow, clock, tokens, mailer, portalUrl }) {
    Object.assign(this, { uow, clock, tokens, mailer, portalUrl });
  }

  async execute(event) {
    const d = event.data;
    const tenantId = event.tenant_id;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const now = this.clock.now();
        const tenant = await repos.tenants.findById(tenantId);
        if (!tenant) throw new Error(`Tenant ${tenantId} is not known yet`); // retried: the tenant arrives first
        const existing = await repos.customerAccounts.findByCustomer(tenantId, d.customer_id, {
          lock: true,
        });
        const email = d.email ? normalizeEmail(d.email) : '';

        if (!existing) {
          if (!email) return;
          const taken = await repos.customerAccounts.findByEmail(tenantId, email);
          if (taken) return this.#refuse(repos, tenantId, d, email);
          const account = createInvitedAccount(
            { tenantId, customerId: d.customer_id, email, fullName: d.full_name },
            { now },
          );
          await repos.customerAccounts.insert(account, event.occurred_at);
          await repos.audit.record({
            tenantId,
            actor: SYSTEM,
            action: 'portal.account_create',
            subjectType: 'customer',
            subjectId: d.customer_id,
            after: { email },
          });
          await issueAccessLink({
            repos,
            account,
            tenant,
            purpose: 'invite',
            tokens: this.tokens,
            now,
            mailer: this.mailer,
            portalUrl: this.portalUrl,
          });
          return;
        }

        if (!email) return; // the email was cleared: keep the account as it is
        try {
          await repos.customerAccounts.applyProfile(
            existing.id,
            { email, fullName: String(d.full_name ?? '').trim() || existing.fullName },
            event.occurred_at,
          );
        } catch (error) {
          if (error instanceof ConflictError) return this.#refuse(repos, tenantId, d, email);
          throw error;
        }
        if (email !== existing.email) {
          await repos.audit.record({
            tenantId,
            actor: SYSTEM,
            action: 'portal.email_change',
            subjectType: 'customer',
            subjectId: d.customer_id,
            before: { email: existing.email },
            after: { email },
          });
          // the account now answers to the new address; anyone holding the old session keeps it until it expires
          if (existing.status === 'invited') {
            await issueAccessLink({
              repos,
              account: { ...existing, email },
              tenant,
              purpose: 'invite',
              tokens: this.tokens,
              now,
              mailer: this.mailer,
              portalUrl: this.portalUrl,
            });
          }
        }
      }),
    );
  }

  async #refuse(repos, tenantId, d, email) {
    await repos.audit.record({
      tenantId,
      actor: SYSTEM,
      action: 'portal.email_conflict',
      subjectType: 'customer',
      subjectId: d.customer_id,
      after: { email },
    });
  }
}
