import { parseDto } from '@/shared/api/contract.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { unitDtoSchema } from '@/shared/api/dtos/unit.dto.js';
import { fieldErrorsFromApi, filtersToApi, fromApi, toApi } from '@/shared/api/dtos/unit.mapper.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { unitsGraphql } from './transport/units.graphql.js';
import { unitsRest } from './transport/units.rest.js';

const unitPageSchema = pageDtoSchema(unitDtoSchema);

/** Re-keys server field errors from wire names to form field names before they leave data/. */
async function renamingFieldErrors(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
    throw error;
  }
}

/**
 * Public data API of the feature for units: transport -> DTO parse -> mapper -> models.
 * Transports are injectable so the parity suite can run the same tests on both.
 */
export function createUnitsRepository({
  transports = { rest: unitsRest, graphql: unitsGraphql },
  pickTransport = () => resolveTransport('inventory'),
} = {}) {
  const t = () => transports[pickTransport()];
  const one = (raw) => fromApi(parseDto(unitDtoSchema, raw, 'unit'));

  return {
    /** @returns {Promise<import('@/shared/api/dtos/page.dto.js').Page<import('../domain/unit.model.js').Unit>>} */
    async list(filters, { cursor, limit, signal } = {}) {
      const raw = await t().list(
        { filters: filtersToApi(filters), page: pageParamsToApi({ cursor, limit }) },
        { signal },
      );
      const page = parseDto(unitPageSchema, raw, 'unit page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async get(id, { signal } = {}) {
      return one(await t().get(id, { signal }));
    },
    create(draft, { idempotencyKey } = {}) {
      return renamingFieldErrors(t().create(toApi(draft), { idempotencyKey }).then(one));
    },
    async block(id, { idempotencyKey } = {}) {
      return one(await t().block(id, { idempotencyKey }));
    },
    async unblock(id, { idempotencyKey } = {}) {
      return one(await t().unblock(id, { idempotencyKey }));
    },
  };
}

export const unitsRepository = createUnitsRepository();
