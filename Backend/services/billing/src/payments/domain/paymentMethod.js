import { ConflictError, newId, validator } from '@estateops/kernel';

/** A saved card. Only brand, last four digits and expiry are kept; the number never reaches us. */
export function createPaymentMethod({
  tenantId,
  customerId,
  card,
  stripePaymentMethodId,
  via,
  actor,
  active,
}) {
  const v = validator('The card could not be saved');
  v.check(Boolean(stripePaymentMethodId), 'payment_method', 'The card is missing');
  v.check(/^\d{4}$/.test(String(card?.last4 ?? '')), 'last4', 'The card details are incomplete');
  v.check(
    Number.isInteger(card?.expMonth) && card.expMonth >= 1 && card.expMonth <= 12,
    'exp_month',
    'The card expiry is invalid',
  );
  v.check(Number.isInteger(card?.expYear), 'exp_year', 'The card expiry is invalid');
  v.done();
  return {
    id: newId(),
    tenantId,
    customerId,
    stripePaymentMethodId,
    brand: card.brand ?? 'card',
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    fingerprint: card.fingerprint ?? null,
    isActive: Boolean(active),
    status: 'active',
    addedBy: actor?.userId ?? null,
    addedByName: actor?.name ?? null,
    addedVia: via,
  };
}

/** A card is usable until the end of its expiry month. `today` is 'YYYY-MM-DD'. */
export function isExpired(method, today) {
  const [year, month] = today.split('-').map(Number);
  return method.expYear < year || (method.expYear === year && method.expMonth < month);
}

/** Only an unexpired, non-removed card can be the one charged. */
export function assertChargeable(method, today) {
  if (!method || method.status !== 'active') {
    throw new ConflictError('NO_ACTIVE_CARD', 'This customer has no saved card to charge');
  }
  if (isExpired(method, today)) {
    throw new ConflictError('CARD_EXPIRED', 'The saved card has expired; add a new card');
  }
}

/** After the active card is removed, the most recently added remaining card takes over. */
export function successorOf(remaining) {
  return (
    [...remaining].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null
  );
}
