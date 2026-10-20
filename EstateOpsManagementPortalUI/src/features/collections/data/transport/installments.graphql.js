import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { INSTALLMENT_FIELDS } from './installments.fragments.js';

const INSTALLMENTS = /* GraphQL */ `
  query Installments($filter: InstallmentFilter, $sort: String, $cursor: String, $limit: Int) {
    installments(filter: $filter, sort: $sort, after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...InstallmentFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${INSTALLMENT_FIELDS}
`;

const PAY = /* GraphQL */ `
  mutation PayInstallment($id: ID!, $input: PaymentInput!) {
    payInstallment(id: $id, input: $input) {
      ...InstallmentFields
    }
  }
  ${INSTALLMENT_FIELDS}
`;

export const installmentsGraphql = {
  async list({ filters, page }, { signal } = {}) {
    const { sort, ...filter } = filters;
    const data = await graphqlClient.query(
      INSTALLMENTS,
      { filter, sort, cursor: page.cursor, limit: page.limit },
      { signal },
    );
    return data.installments;
  },
  async pay(id, body, { idempotencyKey } = {}) {
    return (await graphqlClient.mutate(PAY, { id, input: body }, { idempotencyKey }))
      .payInstallment;
  },
};
