import { http } from 'msw';
import { getCustomer, listCustomers } from '../../engine/customers.js';
import { respond, restPage } from './respond.js';

const BASE = '*/api/v1/admin/customers';

export const customerRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'customers.list',
      perform: (db, ctx) =>
        restPage(listCustomers(db, ctx, Object.fromEntries(new URL(request.url).searchParams))),
    }),
  ),
  http.get(`${BASE}/:id`, ({ request, params }) =>
    respond(request, {
      name: 'customers.get',
      perform: (db, ctx) => getCustomer(db, ctx, params.id),
    }),
  ),
];
