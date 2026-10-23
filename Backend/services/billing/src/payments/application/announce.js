import { EVENT, buildEvent } from '@estateops/contracts';

const outcome = (tx) => ({
  transaction_id: tx.id,
  invoice_id: tx.installmentId,
  booking_id: tx.bookingId,
  customer_id: tx.customerId,
  amount: tx.amount,
  currency: tx.currency,
  card_brand: tx.cardBrand,
  card_last4: tx.cardLast4,
  trigger: tx.trigger,
});
const make = (type, tx, data, now) =>
  buildEvent({ type, tenantId: tx.tenantId, producer: 'billing', data, now });

/** What happened to a card charge: the customer's email and any other listener work from these. */
export const chargeSucceeded = (tx, now) =>
  make(EVENT.PAYMENT_CHARGE_SUCCEEDED, tx, outcome(tx), now);

export const chargeFailed = (tx, { willRetry = false, retryOn = null } = {}, now) =>
  make(
    EVENT.PAYMENT_CHARGE_FAILED,
    tx,
    {
      ...outcome(tx),
      failure_code: tx.failureCode ?? 'card_declined',
      failure_message: tx.failureMessage ?? 'The payment failed',
      will_retry: willRetry,
      retry_on: retryOn,
    },
    now,
  );

export const chargeRefunded = (tx, now) =>
  make(EVENT.PAYMENT_REFUNDED, tx, { ...outcome(tx), reason: tx.failureCode ?? 'REFUNDED' }, now);

/** The daily scan asks the payment worker to charge one invoice. */
export const collectionRequested = (
  { tenantId, invoiceId, bookingId, customerId, attemptKey, attemptNo, reason },
  now,
) =>
  buildEvent({
    type: EVENT.PAYMENT_COLLECTION_REQUESTED,
    tenantId,
    producer: 'billing',
    data: {
      invoice_id: invoiceId,
      booking_id: bookingId,
      customer_id: customerId,
      attempt_key: attemptKey,
      attempt_no: attemptNo,
      reason,
    },
    now,
  });
