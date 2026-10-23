import { InvalidTransitionError, defineMachine, newId, to } from '@estateops/kernel';

export const TRIGGERS = Object.freeze([
  'staff_checkout',
  'staff_saved_card',
  'customer_checkout',
  'customer_saved_card',
  'scheduled',
]);

/**
 * One attempt to collect money for an invoice. Everything Stripe answered is kept on it.
 *   pending -> succeeded | failed | canceled | refunded
 *   succeeded -> refunded      (money taken, then returned)
 * A card that was charged but could not be booked (the balance moved) goes pending -> refunded.
 */
export const transactionMachine = defineMachine('payment_transaction', {
  pending: {
    succeed: to('succeeded'),
    fail: to('failed'),
    cancel: to('canceled'),
    refund: to('refunded'),
  },
  succeeded: { refund: to('refunded') },
  failed: {},
  canceled: {},
  refunded: {},
});

export function startTransaction({
  tenantId,
  invoice,
  customerId,
  amount,
  currency,
  trigger,
  checkoutSessionId = null,
  paymentMethodId = null,
  idempotencyKey = null,
  actor = null,
  now,
}) {
  if (!TRIGGERS.includes(trigger)) throw new Error(`Unknown transaction trigger: ${trigger}`);
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('A transaction needs a positive amount');
  return {
    id: newId(),
    tenantId,
    installmentId: invoice.id,
    bookingId: invoice.bookingId,
    customerId,
    checkoutSessionId,
    paymentMethodId,
    trigger,
    amount,
    currency: String(currency).toUpperCase(),
    status: 'pending',
    stripePaymentIntentId: null,
    stripeChargeId: null,
    stripeRefundId: null,
    cardBrand: null,
    cardLast4: null,
    failureCode: null,
    failureMessage: null,
    stripeResponse: null,
    paymentId: null,
    idempotencyKey,
    createdBy: actor?.userId ?? null,
    createdByName: actor?.name ?? null,
    createdAt: now,
    completedAt: null,
  };
}

const move = (tx, action, patch, now) => {
  if (!transactionMachine.can(tx.status, action)) {
    throw new InvalidTransitionError(`A ${tx.status} transaction cannot ${action}`);
  }
  return {
    ...tx,
    ...patch,
    status: transactionMachine.transition(tx.status, action),
    completedAt: now,
  };
};

export const succeed = (tx, { intentId, chargeId, card, response, paymentId }, now) =>
  move(
    tx,
    'succeed',
    {
      stripePaymentIntentId: intentId ?? tx.stripePaymentIntentId,
      stripeChargeId: chargeId ?? null,
      cardBrand: card?.brand ?? tx.cardBrand,
      cardLast4: card?.last4 ?? tx.cardLast4,
      stripeResponse: response ?? tx.stripeResponse,
      paymentId: paymentId ?? null,
      failureCode: null,
      failureMessage: null,
    },
    now,
  );

export const fail = (tx, { code, message, intentId, response }, now) =>
  move(
    tx,
    'fail',
    {
      failureCode: code ?? 'card_declined',
      failureMessage: message ?? 'The payment failed',
      stripePaymentIntentId: intentId ?? tx.stripePaymentIntentId,
      stripeResponse: response ?? tx.stripeResponse,
    },
    now,
  );

/**
 * A declined attempt inside an open Checkout session: the buyer can try another card in the same
 * form, so the transaction stays pending and only remembers the last reason. Stripe's own answer
 * for the attempt is kept either way (here and in stripe_event).
 */
export const noteAttemptError = (tx, { code, message, intentId, response }) => ({
  ...tx,
  failureCode: code ?? tx.failureCode,
  failureMessage: message ?? tx.failureMessage,
  stripePaymentIntentId: intentId ?? tx.stripePaymentIntentId,
  stripeResponse: response ?? tx.stripeResponse,
});

export const cancel = (tx, response, now) =>
  move(tx, 'cancel', { stripeResponse: response ?? tx.stripeResponse }, now);

export const refund = (tx, { refundId, reason, intentId, chargeId, card, response }, now) =>
  move(
    tx,
    'refund',
    {
      stripeRefundId: refundId,
      failureCode: reason ?? tx.failureCode,
      failureMessage:
        reason === 'BALANCE_CHANGED'
          ? 'The invoice balance changed; the card payment was refunded'
          : tx.failureMessage,
      stripePaymentIntentId: intentId ?? tx.stripePaymentIntentId,
      stripeChargeId: chargeId ?? tx.stripeChargeId,
      cardBrand: card?.brand ?? tx.cardBrand,
      cardLast4: card?.last4 ?? tx.cardLast4,
      stripeResponse: response ?? tx.stripeResponse,
    },
    now,
  );
