import { parseDto } from '@/shared/api/contract.js';
import { collectionsStatsDtoSchema } from '@/shared/api/dtos/stats.dto.js';
import { filtersToApi, fromApi } from '@/shared/api/dtos/stats.mapper.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { statsGraphql } from './transport/stats.graphql.js';
import { statsRest } from './transport/stats.rest.js';

export function createStatsRepository({
  transports = { rest: statsRest, graphql: statsGraphql },
  pickTransport = () => resolveTransport('collections'),
} = {}) {
  return {
    async collections(filters = {}, { signal } = {}) {
      const raw = await transports[pickTransport()].collections(filtersToApi(filters), { signal });
      return fromApi(parseDto(collectionsStatsDtoSchema, raw, 'collections stats'));
    },
  };
}

export const statsRepository = createStatsRepository();
