import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { COLLECTIONS_STATS_FIELDS } from './stats.fragments.js';

const COLLECTIONS_STATS = /* GraphQL */ `
  query CollectionsStats($project_id: ID) {
    collectionsStats(project_id: $project_id) {
      ...CollectionsStatsFields
    }
  }
  ${COLLECTIONS_STATS_FIELDS}
`;

export const statsGraphql = {
  async collections(filters, { signal } = {}) {
    const data = await graphqlClient.query(COLLECTIONS_STATS, filters, { signal });
    return data.collectionsStats;
  },
};
