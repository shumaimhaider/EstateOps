import { parseDto } from '@/shared/api/contract.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import {
  checkoutDtoSchema,
  checkoutStatusDtoSchema,
  paymentMethodDtoSchema,
  transactionDetailDtoSchema,
  transactionDtoSchema,
} from '@/shared/api/dtos/payment.dto.js';
import {
  checkoutFromApi,
  checkoutRequestToApi,
  checkoutStatusFromApi,
  paymentMethodFromApi,
  transactionDetailFromApi,
  transactionFiltersToApi,
  transactionFromApi,
} from '@/shared/api/dtos/payment.mapper.js';
import { paymentsRest } from './transport/payments.rest.js';

const transactionPage = pageDtoSchema(transactionDtoSchema);
const methodPage = pageDtoSchema(paymentMethodDtoSchema);

/** Remaps server field errors (wire names) to the form's field names. */
const FIELD = {
  adjusted_amount: 'adjustedAmount',
  adjustment_reason: 'adjustmentReason',
  amount: 'amount',
};
async function renaming(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.fieldErrors) {
      error.fieldErrors = Object.fromEntries(
        Object.entries(error.fieldErrors).map(([k, v]) => [FIELD[k] ?? k, v]),
      );
    }
    throw error;
  }
}

/**
 * Card payments. The card is typed into Stripe's embedded form, so nothing here ever sees a card
 * number: the API hands out a client secret, Stripe collects the card, the API settles the result.
 */
export function createPaymentsRepository({ transport = paymentsRest } = {}) {
  return {
    /** Opens Stripe's embedded checkout for an invoice. */
    async startCheckout(invoiceId, payment, { saveCard = false, idempotencyKey } = {}) {
      const raw = await renaming(
        transport.startCheckout(invoiceId, checkoutRequestToApi(payment, { saveCard }), {
          idempotencyKey,
        }),
      );
      return checkoutFromApi(parseDto(checkoutDtoSchema, raw, 'checkout'));
    },
    /** Where a checkout stands; an open one is checked with Stripe and settled by the server. */
    async checkoutStatus(checkoutId, { signal } = {}) {
      return checkoutStatusFromApi(
        parseDto(
          checkoutStatusDtoSchema,
          await transport.checkoutStatus(checkoutId, { signal }),
          'checkout status',
        ),
      );
    },
    async chargeSavedCard(invoiceId, payment, { idempotencyKey } = {}) {
      const raw = await renaming(
        transport.chargeSavedCard(invoiceId, checkoutRequestToApi(payment), { idempotencyKey }),
      );
      return transactionFromApi(parseDto(transactionDtoSchema, raw, 'transaction'));
    },
    async listMethods(customerId, { signal } = {}) {
      const page = parseDto(
        methodPage,
        await transport.listMethods(customerId, { signal }),
        'payment methods',
      );
      return page.items.map(paymentMethodFromApi);
    },
    async startCardSetup(customerId, { idempotencyKey } = {}) {
      const raw = await transport.startCardSetup(customerId, { idempotencyKey });
      return checkoutFromApi(parseDto(checkoutDtoSchema, raw, 'card setup'));
    },
    activateMethod: async (customerId, id, o) =>
      paymentMethodFromApi(
        parseDto(
          paymentMethodDtoSchema,
          await transport.activateMethod(customerId, id, o),
          'payment method',
        ),
      ),
    removeMethod: (customerId, id, o) => transport.removeMethod(customerId, id, o),
    async listTransactions(filters, { cursor, limit, signal } = {}) {
      const raw = await transport.listTransactions(
        { filters: transactionFiltersToApi(filters), page: pageParamsToApi({ cursor, limit }) },
        { signal },
      );
      const page = parseDto(transactionPage, raw, 'transaction page');
      return { items: page.items.map(transactionFromApi), nextCursor: page.nextCursor };
    },
    async getTransaction(id, { signal } = {}) {
      return transactionDetailFromApi(
        parseDto(
          transactionDetailDtoSchema,
          await transport.getTransaction(id, { signal }),
          'transaction',
        ),
      );
    },
  };
}

export const paymentsRepository = createPaymentsRepository();
