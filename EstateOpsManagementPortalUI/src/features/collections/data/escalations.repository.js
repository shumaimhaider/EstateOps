import { parseDto } from '@/shared/api/contract.js';
import { escalationDtoSchema } from '@/shared/api/dtos/escalation.dto.js';
import { fromApi } from '@/shared/api/dtos/escalation.mapper.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { escalationsGraphql } from './transport/escalations.graphql.js';
import { escalationsRest } from './transport/escalations.rest.js';

const pageSchema = pageDtoSchema(escalationDtoSchema);

export function createEscalationsRepository({
  transports = { rest: escalationsRest, graphql: escalationsGraphql },
  pickTransport = () => resolveTransport('collections'),
} = {}) {
  const t = () => transports[pickTransport()];
  return {
    async list({ cursor, limit, signal } = {}) {
      const raw = await t().list({ page: pageParamsToApi({ cursor, limit }) }, { signal });
      const page = parseDto(pageSchema, raw, 'escalation page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async sendNotice(id, { idempotencyKey } = {}) {
      const raw = await t().sendNotice(id, { idempotencyKey });
      return fromApi(parseDto(escalationDtoSchema, raw, 'escalation'));
    },
  };
}

export const escalationsRepository = createEscalationsRepository();
