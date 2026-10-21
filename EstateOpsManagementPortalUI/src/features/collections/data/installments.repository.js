import { parseDto } from '@/shared/api/contract.js';
import { installmentDtoSchema, paymentIntentDtoSchema } from '@/shared/api/dtos/installment.dto.js';
import {
  cardPaymentToApi,
  fieldErrorsFromApi,
  filtersToApi,
  fromApi,
  intentFromApi,
  paymentIntentToApi,
  paymentToApi,
} from '@/shared/api/dtos/installment.mapper.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { cardPaymentsRest } from './transport/cardPayments.rest.js';
import { installmentsGraphql } from './transport/installments.graphql.js';
import { installmentsRest } from './transport/installments.rest.js';

const pageSchema = pageDtoSchema(installmentDtoSchema);

/** Stripe error code -> the card form field it belongs to. */
const CARD_FIELD = {
  incorrect_number: 'cardNumber',
  invalid_number: 'cardNumber',
  invalid_expiry: 'cardExpiry',
  expired_card: 'cardExpiry',
  incorrect_cvc: 'cardCvc',
};

/** Scheduled invoices (the installment register): list and record-payment. */
export function createInstallmentsRepository({
  transports = { rest: installmentsRest, graphql: installmentsGraphql },
  pickTransport = () => resolveTransport('collections'),
  cardPayments = cardPaymentsRest,
} = {}) {
  const t = () => transports[pickTransport()];
  return {
    async list(filters, { cursor, limit, signal } = {}) {
      const raw = await t().list(
        { filters: filtersToApi(filters), page: pageParamsToApi({ cursor, limit }) },
        { signal },
      );
      const page = parseDto(pageSchema, raw, 'installment page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async recordPayment(id, payment, { idempotencyKey } = {}) {
      try {
        const raw = await t().pay(id, paymentToApi(payment), { idempotencyKey });
        return fromApi(parseDto(installmentDtoSchema, raw, 'installment'));
      } catch (error) {
        if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
        throw error;
      }
    },
    /**
     * Charges a card: start the payment, confirm the card with Stripe (the card never touches our
     * API), then ask our API to verify and record it. Safe to retry with the same key.
     */
    async payByCard(id, payment, card, { idempotencyKey } = {}) {
      let rawIntent;
      try {
        rawIntent = await cardPayments.createIntent(id, paymentIntentToApi(payment), {
          idempotencyKey: `${idempotencyKey}:intent`,
        });
      } catch (error) {
        if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
        throw error;
      }
      const intent = intentFromApi(parseDto(paymentIntentDtoSchema, rawIntent, 'payment intent'));
      try {
        await cardPayments.confirm({ clientSecret: intent.clientSecret, card });
      } catch (error) {
        const field = CARD_FIELD[error.code];
        if (field) error.fieldErrors = { [field]: error.message };
        throw error;
      }
      try {
        const raw = await cardPayments.record(id, cardPaymentToApi(intent.paymentIntentId), {
          idempotencyKey: `${idempotencyKey}:record`,
        });
        return fromApi(parseDto(installmentDtoSchema, raw, 'installment'));
      } catch (error) {
        if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
        throw error;
      }
    },
  };
}

export const installmentsRepository = createInstallmentsRepository();
