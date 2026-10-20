import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { BOOKING_FIELDS } from './bookings.fragments.js';

const BOOKINGS = /* GraphQL */ `
  query Bookings($filter: BookingFilter, $sort: String, $cursor: String, $limit: Int) {
    bookings(filter: $filter, sort: $sort, after: $cursor, first: $limit) {
      edges {
        cursor
        node {
          ...BookingFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${BOOKING_FIELDS}
`;

const BOOKING = /* GraphQL */ `
  query Booking($id: ID!) {
    booking(id: $id) {
      ...BookingFields
    }
  }
  ${BOOKING_FIELDS}
`;

export const bookingsGraphql = {
  async list({ filters, page }, { signal } = {}) {
    const { sort, ...filter } = filters;
    const data = await graphqlClient.query(
      BOOKINGS,
      { filter, sort, cursor: page.cursor, limit: page.limit },
      { signal },
    );
    return data.bookings;
  },
  async get(id, { signal } = {}) {
    return (await graphqlClient.query(BOOKING, { id }, { signal })).booking;
  },
};
