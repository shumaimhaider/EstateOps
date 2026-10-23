import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { isExpired, successorOf } from '../domain/paymentMethod.js';

/** Staff need the card permission; a customer's actor (it carries customerId) only ever reaches its own cards. */
const check = (actor, customerId) => {
  if (!actor.customerId) return assertCan(actor, PERMISSION.PAYMENTS_CARD);
  if (customerId !== actor.customerId) throw new NotFoundError('Card not found');
  return undefined;
};

/** A customer's saved cards, active one first. */
export class ListPaymentMethods {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, customerId }) {
    check(actor, customerId);
    const today = this.clock.now().toISOString().slice(0, 10);
    const methods = await this.uow.read((repos) =>
      repos.paymentMethods.listForCustomer(actor.tenantId, customerId),
    );
    return methods.map((m) => ({ ...m, expired: isExpired(m, today) }));
  }
}

/** Makes one saved card the one charged; the previous active card stays saved. */
export class SetActivePaymentMethod {
  constructor({ uow }) {
    Object.assign(this, { uow });
  }

  async execute({ actor, customerId, id }) {
    check(actor, customerId);
    return this.uow.run(async (repos) => {
      const method = await repos.paymentMethods.findById(actor.tenantId, id);
      if (!method || method.customerId !== customerId || method.status !== 'active') {
        throw new NotFoundError('Card not found');
      }
      if (!method.isActive) {
        await repos.paymentMethods.setActive(actor.tenantId, customerId, id);
        await repos.audit.record({
          tenantId: actor.tenantId,
          actor,
          action: 'payment_method.activate',
          subjectType: 'customer',
          subjectId: customerId,
          after: { brand: method.brand, last4: method.last4 },
        });
      }
      return { ...method, isActive: true };
    });
  }
}

/**
 * Removes a saved card at Stripe and here. If it was the active card, the newest remaining card
 * takes over so scheduled charges keep working.
 */
export class RemovePaymentMethod {
  constructor({ uow, gateway }) {
    Object.assign(this, { uow, gateway });
  }

  async execute({ actor, customerId, id }) {
    check(actor, customerId);
    return this.uow.run(async (repos) => {
      const method = await repos.paymentMethods.findById(actor.tenantId, id);
      if (!method || method.customerId !== customerId || method.status !== 'active') {
        throw new NotFoundError('Card not found');
      }
      await this.gateway.detachPaymentMethod(method.stripePaymentMethodId).catch((error) => {
        if (error.code !== 'resource_missing' && error.status !== 404) throw error;
      });
      await repos.paymentMethods.markRemoved(actor.tenantId, id);
      let promoted = null;
      if (method.isActive) {
        promoted = successorOf(
          await repos.paymentMethods.listForCustomer(actor.tenantId, customerId),
        );
        if (promoted) await repos.paymentMethods.setActive(actor.tenantId, customerId, promoted.id);
      }
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'payment_method.remove',
        subjectType: 'customer',
        subjectId: customerId,
        before: { brand: method.brand, last4: method.last4, active: method.isActive },
        after: { activeNow: promoted ? `${promoted.brand} ${promoted.last4}` : null },
      });
      return { removed: id, activeId: promoted?.id ?? null };
    });
  }
}
