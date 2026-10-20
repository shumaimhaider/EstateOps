import { parseDto } from '@/shared/api/contract.js';
import { customerDtoSchema } from '@/shared/api/dtos/customer.dto.js';
import { filtersToApi, fromApi } from '@/shared/api/dtos/customer.mapper.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { customersGraphql } from './transport/customers.graphql.js';
import { customersRest } from './transport/customers.rest.js';

const pageSchema = pageDtoSchema(customerDtoSchema);

export function createCustomersRepository({
  transports = { rest: customersRest, graphql: customersGraphql },
  pickTransport = () => resolveTransport('customers'),
} = {}) {
  const t = () => transports[pickTransport()];
  return {
    async list(filters, { cursor, limit, signal } = {}) {
      const raw = await t().list(
        { filters: filtersToApi(filters), page: pageParamsToApi({ cursor, limit }) },
        { signal },
      );
      const page = parseDto(pageSchema, raw, 'customer page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async get(id, { signal } = {}) {
      return fromApi(parseDto(customerDtoSchema, await t().get(id, { signal }), 'customer'));
    },
  };
}

export const customersRepository = createCustomersRepository();
