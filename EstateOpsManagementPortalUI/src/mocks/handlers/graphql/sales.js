import { graphql } from 'msw';
import { getBooking, listBookings } from '../../engine/bookings.js';
import { respondGraphql, toConnection, listArgs } from './respond.js';

export const salesGraphqlHandlers = [
  graphql.query('Bookings', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'bookings.list',
      perform: (db, ctx) => ({
        bookings: toConnection(listBookings(db, ctx, listArgs(variables))),
      }),
    }),
  ),
  graphql.query('Booking', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'bookings.get',
      perform: (db, ctx) => ({ booking: getBooking(db, ctx, variables.id) }),
    }),
  ),
];
