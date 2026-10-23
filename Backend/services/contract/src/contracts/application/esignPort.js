/**
 * What the contract service needs from the e-signature provider (PandaDoc).
 *
 *   createDocument({ template, signerEmail, signerName, bookingId, unitNo }) -> { documentId }
 *   sendDocument(documentId, signerEmail, { subject, message })               -> void
 *   voidDocument(documentId)                                                  -> void
 *   createSigningSession(documentId, signerEmail, { lifetimeSec })            -> { sessionId, expiresAt, url }
 *   downloadDocument(documentId)                                              -> Buffer (the signed PDF)
 *   verifyWebhook(rawBody, signature)  -> [{ documentId, status, at }]  (throws WebhookSignatureError)
 *
 * `status` in a webhook event is PandaDoc's own: document.viewed, document.completed, ...
 */
export const ESIGN_METHODS = Object.freeze([
  'createDocument',
  'sendDocument',
  'voidDocument',
  'createSigningSession',
  'downloadDocument',
  'verifyWebhook',
]);

export class ProviderError extends Error {
  constructor(message, { status = null, code = 'PROVIDER_ERROR' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
  }
}

export class WebhookSignatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export function assertESign(esign) {
  const missing = ESIGN_METHODS.filter((m) => typeof esign?.[m] !== 'function');
  if (missing.length) throw new Error(`The e-signature provider is missing: ${missing.join(', ')}`);
  return esign;
}

/** PandaDoc webhook status -> the action it means for a contract (undefined: nothing to do). */
export const STATUS_ACTION = Object.freeze({
  'document.viewed': 'view',
  'document.completed': 'sign',
  'document.declined': 'decline',
  'document.voided': 'void',
});
