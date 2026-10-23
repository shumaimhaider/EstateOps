import { createPaymentMethod } from '../domain/paymentMethod.js';

/**
 * Stores a card Stripe now holds for the customer. The same physical card is stored once (matched
 * by Stripe's fingerprint) and the first card a customer saves becomes the active one.
 * `stripePm`: { id, brand, last4, expMonth, expYear, fingerprint }.
 */
export async function savePaymentMethod({
  repos,
  tenantId,
  customerId,
  stripePm,
  via,
  actor,
  makeActive = false,
}) {
  const known =
    (await repos.paymentMethods.findByStripeId(tenantId, stripePm.id)) ??
    (await repos.paymentMethods.findActiveByFingerprint(
      tenantId,
      customerId,
      stripePm.fingerprint,
    ));
  if (known && known.status === 'active' && known.customerId === customerId)
    return { method: known, created: false };

  const current = await repos.paymentMethods.findActive(tenantId, customerId);
  const method = createPaymentMethod({
    tenantId,
    customerId,
    stripePaymentMethodId: stripePm.id,
    card: stripePm,
    via,
    actor,
    active: false,
  });
  await repos.paymentMethods.insert(method);
  if (!current || makeActive) await repos.paymentMethods.setActive(tenantId, customerId, method.id);
  await repos.audit.record({
    tenantId,
    actor: actor ?? { userId: null, name: 'Stripe' },
    action: 'payment_method.add',
    subjectType: 'customer',
    subjectId: customerId,
    after: { brand: method.brand, last4: method.last4, active: !current || makeActive },
  });
  return { method: { ...method, isActive: !current || makeActive }, created: true };
}
