import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { CUSTOMER_FIELDS } from './customers.fragments.js';

const CUSTOMERS = /* GraphQL */ `
  query Customers($filter: CustomerFilter, $sort: String, $cursor: String, $limit: Int) {
    customers(filter: $filter, sort: $sort, after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...CustomerFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${CUSTOMER_FIELDS}
`;

const CUSTOMER = /* GraphQL */ `
  query Customer($id: ID!) {
    customer(id: $id) {
      ...CustomerFields
    }
  }
  ${CUSTOMER_FIELDS}
`;

export const customersGraphql = {
  async list({ filters, page }, { signal } = {}) {
    const { sort, ...filter } = filters;
    const data = await graphqlClient.query(
      CUSTOMERS,
      { filter, sort, cursor: page.cursor, limit: page.limit },
      { signal },
    );
    return data.customers;
  },
  async get(id, { signal } = {}) {
    return (await graphqlClient.query(CUSTOMER, { id }, { signal })).customer;
  },
};
