import { httpClient } from '@/shared/api/httpClient.js';
import { confirmCardPayment } from '@/shared/api/stripeClient.js';

/** Card payments: our API starts and records the payment, Stripe confirms the card directly. */
export const cardPaymentsRest = {
  createIntent: (id, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/installments/${id}/payment-intents`, body, { idempotencyKey }),
  confirm: ({ clientSecret, card }) => confirmCardPayment({ clientSecret, card }),
  record: (id, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/installments/${id}/card-payments`, body, { idempotencyKey }),
};
