import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { ESCALATION_FIELDS } from './escalations.fragments.js';

const ESCALATIONS = /* GraphQL */ `
  query Escalations($cursor: String, $limit: Int) {
    escalations(after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...EscalationFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${ESCALATION_FIELDS}
`;

const SEND_NOTICE = /* GraphQL */ `
  mutation SendEscalationNotice($id: ID!) {
    sendEscalationNotice(id: $id) {
      ...EscalationFields
    }
  }
  ${ESCALATION_FIELDS}
`;

export const escalationsGraphql = {
  async list({ page }, { signal } = {}) {
    const data = await graphqlClient.query(
      ESCALATIONS,
      { cursor: page.cursor, limit: page.limit },
      { signal },
    );
    return data.escalations;
  },
  async sendNotice(id, { idempotencyKey } = {}) {
    return (await graphqlClient.mutate(SEND_NOTICE, { id }, { idempotencyKey }))
      .sendEscalationNotice;
  },
};
