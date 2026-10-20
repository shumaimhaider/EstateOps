import { parseDto } from '@/shared/api/contract.js';
import { installmentDtoSchema } from '@/shared/api/dtos/installment.dto.js';
import {
  fieldErrorsFromApi,
  filtersToApi,
  fromApi,
  paymentToApi,
} from '@/shared/api/dtos/installment.mapper.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { installmentsGraphql } from './transport/installments.graphql.js';
import { installmentsRest } from './transport/installments.rest.js';

const pageSchema = pageDtoSchema(installmentDtoSchema);

/** Scheduled invoices (the installment register): list and record-payment. */
export function createInstallmentsRepository({
  transports = { rest: installmentsRest, graphql: installmentsGraphql },
  pickTransport = () => resolveTransport('collections'),
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
  };
}

export const installmentsRepository = createInstallmentsRepository();
