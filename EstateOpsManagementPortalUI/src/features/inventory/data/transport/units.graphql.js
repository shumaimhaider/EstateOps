import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { UNIT_DETAIL_FIELDS, UNIT_FIELDS } from './units.fragments.js';

const UNITS_QUERY = /* GraphQL */ `
  query Units($filter: UnitFilter, $sort: String, $cursor: String, $limit: Int) {
    units(filter: $filter, sort: $sort, after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...UnitFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${UNIT_FIELDS}
`;

const UNIT_QUERY = /* GraphQL */ `
  query Unit($id: ID!) {
    unit(id: $id) {
      ...UnitDetailFields
    }
  }
  ${UNIT_DETAIL_FIELDS}
`;

const CREATE_UNIT = /* GraphQL */ `
  mutation CreateUnit($input: UnitInput!) {
    createUnit(input: $input) {
      ...UnitDetailFields
    }
  }
  ${UNIT_DETAIL_FIELDS}
`;

const BLOCK_UNIT = /* GraphQL */ `
  mutation BlockUnit($id: ID!) {
    blockUnit(id: $id) {
      ...UnitDetailFields
    }
  }
  ${UNIT_DETAIL_FIELDS}
`;

const UNBLOCK_UNIT = /* GraphQL */ `
  mutation UnblockUnit($id: ID!) {
    unblockUnit(id: $id) {
      ...UnitDetailFields
    }
  }
  ${UNIT_DETAIL_FIELDS}
`;

/** Same function signatures as units.rest.js; returns RAW JSON (the operation's root value). */
export const unitsGraphql = {
  async list({ filters, page }, { signal } = {}) {
    const { q, status, kind, project_id: projectId, sort } = filters;
    const data = await graphqlClient.query(
      UNITS_QUERY,
      {
        filter: { q, status, kind, project_id: projectId },
        sort,
        cursor: page.cursor,
        limit: page.limit,
      },
      { signal },
    );
    return data.units;
  },
  async get(id, { signal } = {}) {
    return (await graphqlClient.query(UNIT_QUERY, { id }, { signal })).unit;
  },
  async create(body, { idempotencyKey } = {}) {
    return (await graphqlClient.mutate(CREATE_UNIT, { input: body }, { idempotencyKey }))
      .createUnit;
  },
  async block(id, { idempotencyKey } = {}) {
    return (await graphqlClient.mutate(BLOCK_UNIT, { id }, { idempotencyKey })).blockUnit;
  },
  async unblock(id, { idempotencyKey } = {}) {
    return (await graphqlClient.mutate(UNBLOCK_UNIT, { id }, { idempotencyKey })).unblockUnit;
  },
};
