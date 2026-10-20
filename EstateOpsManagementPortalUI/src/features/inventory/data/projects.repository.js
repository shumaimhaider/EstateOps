import { parseDto } from '@/shared/api/contract.js';
import { pageDtoSchema, pageParamsToApi } from '@/shared/api/dtos/page.dto.js';
import { projectDtoSchema, projectMapDtoSchema } from '@/shared/api/dtos/project.dto.js';
import { fromApi, mapFromApi } from '@/shared/api/dtos/project.mapper.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { projectsGraphql } from './transport/projects.graphql.js';
import { projectsRest } from './transport/projects.rest.js';

const projectPageSchema = pageDtoSchema(projectDtoSchema);

export function createProjectsRepository({
  transports = { rest: projectsRest, graphql: projectsGraphql },
  pickTransport = () => resolveTransport('inventory'),
} = {}) {
  const t = () => transports[pickTransport()];
  return {
    async list({ cursor, limit = 100, signal } = {}) {
      const raw = await t().list({ page: pageParamsToApi({ cursor, limit }) }, { signal });
      const page = parseDto(projectPageSchema, raw, 'project page');
      return { items: page.items.map(fromApi), nextCursor: page.nextCursor };
    },
    async get(id, { signal } = {}) {
      return fromApi(parseDto(projectDtoSchema, await t().get(id, { signal }), 'project'));
    },
    /** Site plan with live unit statuses. */
    async map(id, { signal } = {}) {
      return mapFromApi(
        parseDto(projectMapDtoSchema, await t().map(id, { signal }), 'project map'),
      );
    },
  };
}

export const projectsRepository = createProjectsRepository();
