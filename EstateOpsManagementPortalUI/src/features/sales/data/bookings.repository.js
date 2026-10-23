import { parseDto } from '@/shared/api/contract.js';
import { bookingDtoSchema } from '@/shared/api/dtos/booking.dto.js';
import { filtersToApi, fromApi } from '@/shared/api/dtos/booking.mapper.js';
import {
  bookingRequestToApi,
  customerChoiceDtoSchema,
  customerChoiceFromApi,
  planChoiceDtoSchema,
  planChoiceFromApi,
  unitChoiceDtoSchema,
  unitChoiceFromApi,
} from '@/shared/api/dtos/bookingLookup.dto.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { bookingsGraphql } from './transport/bookings.graphql.js';
import { bookingsRest } from './transport/bookings.rest.js';

const pageSchema = pageDtoSchema(bookingDtoSchema);
const unitChoices = pageDtoSchema(unitChoiceDtoSchema);
const customerChoices = pageDtoSchema(customerChoiceDtoSchema);
const planChoices = pageDtoSchema(planChoiceDtoSchema);

/** Remaps server field errors (wire names) to the form's field names. */
const FIELD = {
  unit_id: 'unitId',
  customer_id: 'customerId',
  plan_id: 'planId',
  booked_at: 'bookedAt',
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

export function createBookingsRepository({
  transports = { rest: bookingsRest, graphql: bookingsGraphql },
  rest = bookingsRest, // creating and the form's lookups are REST only
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
    /** Starts a booking. The server finishes it in a few seconds (unit reserved, schedule made). */
    async create(values, { idempotencyKey } = {}) {
      const raw = await renaming(rest.create(bookingRequestToApi(values), { idempotencyKey }));
      return fromApi(parseDto(bookingDtoSchema, raw, 'booking'));
    },
    async searchUnits(q, { signal } = {}) {
      const page = parseDto(unitChoices, await rest.searchUnits({ q }, { signal }), 'units');
      return page.items.map(unitChoiceFromApi);
    },
    async searchCustomers(q, { signal } = {}) {
      const page = parseDto(
        customerChoices,
        await rest.searchCustomers({ q }, { signal }),
        'customers',
      );
      return page.items.map(customerChoiceFromApi);
    },
    async listPlans({ signal } = {}) {
      const page = parseDto(planChoices, await rest.listPlans({ signal }), 'plans');
      return page.items.map(planChoiceFromApi);
    },
  };
}

export const bookingsRepository = createBookingsRepository();
