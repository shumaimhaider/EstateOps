import { parseDto } from '@/shared/api/contract.js';
import { bookingDtoSchema } from '@/shared/api/dtos/booking.dto.js';
import { filtersToApi, fromApi } from '@/shared/api/dtos/booking.mapper.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { bookingsGraphql } from './transport/bookings.graphql.js';
import { bookingsRest } from './transport/bookings.rest.js';

const pageSchema = pageDtoSchema(bookingDtoSchema);

export function createBookingsRepository({
  transports = { rest: bookingsRest, graphql: bookingsGraphql },
  pickTransport = () => resolveTransport('sales'),
} = {}) {
  const t = () => transports[pickTransport()];
  return {
    async list(filters, { cursor, limit, signal } = {}) {
      const raw = await t().list(
        { filters: filtersToApi(filters), page: pageParamsToApi({ cursor, limit }) },
        { signal },
      );
      const page = parseDto(pageSchema, raw, 'booking page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async get(id, { signal } = {}) {
      return fromApi(parseDto(bookingDtoSchema, await t().get(id, { signal }), 'booking'));
    },
  };
}

export const bookingsRepository = createBookingsRepository();
