import { httpClient } from '@/shared/api/httpClient.js';

/** REST calls for card payments. Paths and query params only; returns RAW JSON. */
export const paymentsRest = {
  startCheckout: (invoiceId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/installments/${invoiceId}/checkout-session`, body, { idempotencyKey }),
  checkoutStatus: (checkoutId, { signal } = {}) =>
    httpClient.get(`/admin/checkout-sessions/${checkoutId}`, { signal }),
  chargeSavedCard: (invoiceId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/installments/${invoiceId}/charge-saved-card`, body, { idempotencyKey }),
  listMethods: (customerId, { signal } = {}) =>
    httpClient.get(`/admin/customers/${customerId}/payment-methods`, { signal }),
  startCardSetup: (customerId, { idempotencyKey } = {}) =>
    httpClient.post(
      `/admin/customers/${customerId}/payment-methods/setup-session`,
      {},
      { idempotencyKey },
    ),
  activateMethod: (customerId, id, { idempotencyKey } = {}) =>
    httpClient.post(
      `/admin/customers/${customerId}/payment-methods/${id}/activate`,
      {},
      { idempotencyKey },
    ),
  removeMethod: (customerId, id, { idempotencyKey } = {}) =>
    httpClient.delete(`/admin/customers/${customerId}/payment-methods/${id}`, { idempotencyKey }),
  listTransactions: ({ filters, page }, { signal } = {}) =>
    httpClient.get('/admin/transactions', { query: { ...filters, ...page }, signal }),
  getTransaction: (id, { signal } = {}) => httpClient.get(`/admin/transactions/${id}`, { signal }),
};
