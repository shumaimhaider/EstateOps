import { NotFoundError, PERMISSION, assertCan, newId } from '@estateops/kernel';
import { ensureStripeCustomer } from './ensureStripeCustomer.js';

/**
 * Opens an embedded Checkout session in setup mode so a customer's card can be saved for later
 * charges. Staff add cards on the customer's behalf; the customer portal uses the same use case
 * through an actor that carries `customerId`.
 * input: { actor, customerId }
 */
export class CreateCardSetupSession {
  constructor({ uow, gateway, stripe }) {
    Object.assign(this, { uow, gateway, stripe });
  }

  async execute({ actor, customerId }) {
    // a customer's actor carries customerId and can only add a card for themselves
    const via = actor.customerId ? 'customer' : 'staff';
    if (via === 'staff') assertCan(actor, PERMISSION.PAYMENTS_CARD);
    else if (customerId !== actor.customerId) throw new NotFoundError('Customer not found');
    return this.uow.run(async (repos) => {
      if (!(await repos.customerRefs.find(actor.tenantId, customerId))) {
        throw new NotFoundError('Customer not found');
      }
      const stripeCustomerId = await ensureStripeCustomer({
        repos,
        gateway: this.gateway,
        tenantId: actor.tenantId,
        customerId,
      });
      const checkoutId = newId();
      const session = await this.gateway.createSetupSession(
        {
          customerId: stripeCustomerId,
          returnUrl: this.stripe.returnUrl.replace('{CHECKOUT_ID}', checkoutId),
          metadata: { tenant_id: actor.tenantId, customer_id: customerId, checkout_id: checkoutId },
        },
        { idempotencyKey: `chk:${checkoutId}` },
      );
      await repos.checkouts.insert({
        id: checkoutId,
        tenantId: actor.tenantId,
        purpose: 'save_card',
        customerId,
        installmentId: null,
        stripeSessionId: session.id,
        amount: null,
        currency: null,
        adjustedAmount: null,
        adjustmentReason: null,
        saveCard: true,
        status: 'open',
        createdBy: actor.userId,
        createdByName: actor.name,
        createdVia: via,
      });
      return {
        checkoutId,
        clientSecret: session.clientSecret,
        publishableKey: this.stripe.publishableKey,
      };
    });
  }
}
