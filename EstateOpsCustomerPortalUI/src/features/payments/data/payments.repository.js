import { parseDto } from '@/shared/api/contract.js';
import { httpClient } from '@/shared/api/httpClient.js';
import { listDtoSchema } from '@/shared/api/dtos/property.dto.js';
import {
  checkoutDtoSchema,
  checkoutStatusDtoSchema,
  paymentMethodDtoSchema,
  transactionDtoSchema,
} from '@/shared/api/dtos/payment.dto.js';
import {
  checkoutFromApi,
  checkoutRequestToApi,
  checkoutStatusFromApi,
  paymentMethodFromApi,
  transactionFromApi,
} from '@/shared/api/dtos/payment.mapper.js';

const FIELD = { amount: 'amount' };
async function renaming(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.fieldErrors)
      error.fieldErrors = Object.fromEntries(
        Object.entries(error.fieldErrors).map(([k, v]) => [FIELD[k] ?? k, v]),
      );
    throw error;
  }
}

/**
 * Paying and keeping cards. The card is typed into Stripe's own form, so nothing here ever sees a
 * card number: the API hands out a client secret, Stripe collects the card, the API settles it.
 */
export function createPaymentsRepository({ http = httpClient } = {}) {
  return {
    async startCheckout(invoiceId, payment, { idempotencyKey } = {}) {
      const raw = await renaming(
        http.post(`/portal/invoices/${invoiceId}/checkout-session`, checkoutRequestToApi(payment), {
          idempotencyKey,
        }),
      );
      return checkoutFromApi(parseDto(checkoutDtoSchema, raw, 'checkout'));
    },
    async checkoutStatus(checkoutId, { signal } = {}) {
      return checkoutStatusFromApi(
        parseDto(
          checkoutStatusDtoSchema,
          await http.get(`/portal/checkout-sessions/${checkoutId}`, { signal }),
          'checkout status',
        ),
      );
    },
    async chargeSavedCard(invoiceId, payment, { idempotencyKey } = {}) {
      const raw = await renaming(
        http.post(
          `/portal/invoices/${invoiceId}/charge-saved-card`,
          checkoutRequestToApi(payment),
          { idempotencyKey },
        ),
      );
      return transactionFromApi(parseDto(transactionDtoSchema, raw, 'transaction'));
    },
    async listCards({ signal } = {}) {
      const page = parseDto(
        listDtoSchema(paymentMethodDtoSchema),
        await http.get('/portal/payment-methods', { signal }),
        'cards',
      );
      return page.data.map(paymentMethodFromApi);
    },
    async startCardSetup({ idempotencyKey } = {}) {
      return checkoutFromApi(
        parseDto(
          checkoutDtoSchema,
          await http.post('/portal/payment-methods/setup-session', {}, { idempotencyKey }),
          'card setup',
        ),
      );
    },
    async activateCard(id, { idempotencyKey } = {}) {
      return paymentMethodFromApi(
        parseDto(
          paymentMethodDtoSchema,
          await http.post(`/portal/payment-methods/${id}/activate`, {}, { idempotencyKey }),
          'card',
        ),
      );
    },
    removeCard: (id, { idempotencyKey } = {}) =>
      http.delete(`/portal/payment-methods/${id}`, { idempotencyKey }),
    async listTransactions({ bookingId, cursor, limit } = {}, { signal } = {}) {
      const page = parseDto(
        listDtoSchema(transactionDtoSchema),
        await http.get('/portal/transactions', {
          query: { booking_id: bookingId, cursor, limit },
          signal,
        }),
        'transactions',
      );
      return { items: page.data.map(transactionFromApi), nextCursor: page.next_cursor };
    },
  };
}

export const paymentsRepository = createPaymentsRepository();
