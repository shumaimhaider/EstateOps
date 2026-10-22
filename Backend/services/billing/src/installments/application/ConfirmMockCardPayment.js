import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/**
 * Development only: stands in for the browser confirming a card with the provider, so the card
 * flow can be exercised without a real provider. Never mounted in production.
 * input: { actor, providerId, clientSecret, card }
 */
export class ConfirmMockCardPayment {
  constructor({ uow, gateway }) {
    Object.assign(this, { uow, gateway });
  }

  async execute({ actor, providerId, clientSecret, card }) {
    assertCan(actor, PERMISSION.PAYMENTS_CARD);
    const intent = await this.uow.read((repos) =>
      repos.intents.findByProviderId(actor.tenantId, providerId),
    );
    if (!intent) throw new NotFoundError('Payment not found');
    return this.gateway.confirm({ providerId, clientSecret, card });
  }
}
