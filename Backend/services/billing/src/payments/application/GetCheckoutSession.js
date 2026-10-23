import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { settleCheckout } from './settleCheckout.js';

/**
 * Where a checkout stands. The browser lands here after the embedded form finishes, possibly
 * before Stripe's webhook arrived, so an open checkout is checked with Stripe and settled now.
 * input: { actor, id, via? }
 */
export class GetCheckoutSession {
  constructor({ uow, clock, gateway }) {
    Object.assign(this, { uow, clock, gateway });
  }

  async execute({ actor, id }) {
    // a customer's actor carries customerId and may only see their own checkouts
    if (!actor.customerId) assertCan(actor, PERMISSION.PAYMENTS_CARD);
    const open = await this.uow.read((repos) => repos.checkouts.findById(actor.tenantId, id));
    if (!open || (actor.customerId && open.customerId !== actor.customerId))
      throw new NotFoundError('Checkout not found');
    if (open.status === 'open') {
      const session = await this.gateway.retrieveSession(open.stripeSessionId);
      await this.uow.run((repos) =>
        settleCheckout({
          repos,
          gateway: this.gateway,
          clock: this.clock,
          checkoutId: open.id,
          session,
        }),
      );
    }
    return this.uow.read(async (repos) => {
      const checkout = await repos.checkouts.findById(actor.tenantId, id);
      const transaction = await repos.transactions.findByCheckout(id);
      return { checkout, transaction };
    });
  }
}
