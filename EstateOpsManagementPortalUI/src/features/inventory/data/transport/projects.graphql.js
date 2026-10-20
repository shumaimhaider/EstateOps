import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { PROJECT_FIELDS, PROJECT_MAP_FIELDS } from './projects.fragments.js';

const PROJECTS_QUERY = /* GraphQL */ `
  query Projects($cursor: String, $limit: Int) {
    projects(after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...ProjectFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${PROJECT_FIELDS}
`;

const PROJECT_QUERY = /* GraphQL */ `
  query Project($id: ID!) {
    project(id: $id) {
      ...ProjectFields
    }
  }
  ${PROJECT_FIELDS}
`;

const PROJECT_MAP_QUERY = /* GraphQL */ `
  query ProjectMap($id: ID!) {
    projectMap(id: $id) {
      ...ProjectMapFields
    }
  }
  ${PROJECT_MAP_FIELDS}
`;

export const projectsGraphql = {
  async list({ page }, { signal } = {}) {
    const data = await graphqlClient.query(
      PROJECTS_QUERY,
      { cursor: page.cursor, limit: page.limit },
      { signal },
    );
    return data.projects;
  },
  async get(id, { signal } = {}) {
    return (await graphqlClient.query(PROJECT_QUERY, { id }, { signal })).project;
  },
  async map(id, { signal } = {}) {
    return (await graphqlClient.query(PROJECT_MAP_QUERY, { id }, { signal })).projectMap;
  },
};
