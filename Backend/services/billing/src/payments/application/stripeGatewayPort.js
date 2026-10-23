/**
 * What billing needs from the card provider. The Stripe adapter implements it; use cases only ever
 * see these methods and plain objects, never the Stripe SDK.
 *
 *   createCustomer({ email, name, metadata }, { idempotencyKey })           -> { id, raw }
 *   createPaymentSession({ customerId, amount, currency, description, metadata, returnUrl,
 *                          saveCard, expiresAt }, { idempotencyKey })        -> { id, clientSecret, raw }
 *   createSetupSession({ customerId, returnUrl, metadata }, { idempotencyKey }) -> { id, clientSecret, raw }
 *   retrieveSession(id)  -> { id, status, mode, paymentStatus, customerId, metadata,
 *                             payment: { intentId, status, amount, currency, chargeId, card, metadata } | null,
 *                             setup: { paymentMethod } | null, raw }
 *   expireSession(id)    -> { id, status }
 *   chargeSavedCard({ customerId, paymentMethodId, amount, currency, description, metadata },
 *                   { idempotencyKey }) -> { ok: true, payment, raw } | { ok: false, error, raw }
 *   refund({ paymentIntentId, amount, reason }, { idempotencyKey }) -> { id, status, amount, raw }
 *   retrievePaymentMethod(id)  -> { id, brand, last4, expMonth, expYear, fingerprint, customerId }
 *   detachPaymentMethod(id)    -> void
 *   verifyWebhook(rawBody, signatureHeader) -> event (throws WebhookSignatureError)
 *
 * `card` is { brand, last4, expMonth, expYear }. `error` is { code, declineCode, message }.
 */
export const GATEWAY_METHODS = Object.freeze([
  'createCustomer',
  'createPaymentSession',
  'createSetupSession',
  'retrieveSession',
  'expireSession',
  'chargeSavedCard',
  'refund',
  'retrievePaymentMethod',
  'detachPaymentMethod',
  'verifyWebhook',
]);

export class ProviderError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export class WebhookSignatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export function assertStripeGateway(gateway) {
  const missing = GATEWAY_METHODS.filter((m) => typeof gateway?.[m] !== 'function');
  if (missing.length) throw new Error(`Card gateway is missing: ${missing.join(', ')}`);
  return gateway;
}
