import { http } from 'msw';
import { getBooking, listBookings } from '../../engine/bookings.js';
import { respond, restPage } from './respond.js';

const BASE = '*/api/v1/admin/bookings';
const query = (request) => Object.fromEntries(new URL(request.url).searchParams);

export const salesRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'bookings.list',
      perform: (db, ctx) => restPage(listBookings(db, ctx, query(request))),
    }),
  ),
  http.get(`${BASE}/:id`, ({ request, params }) =>
    respond(request, {
      name: 'bookings.get',
      perform: (db, ctx) => getBooking(db, ctx, params.id),
    }),
  ),
];
