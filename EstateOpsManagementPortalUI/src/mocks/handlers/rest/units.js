import { http } from 'msw';
import { actOnUnit, createUnit, getUnit, listUnits } from '../../engine/units.js';
import { respond, restPage } from './respond.js';

const BASE = '*/api/v1/admin/units';
const query = (request) => Object.fromEntries(new URL(request.url).searchParams);

export const unitRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'units.list',
      perform: (db, ctx) => restPage(listUnits(db, ctx, query(request))),
    }),
  ),
  http.get(`${BASE}/:id`, ({ request, params }) =>
    respond(request, { name: 'units.get', perform: (db, ctx) => getUnit(db, ctx, params.id) }),
  ),
  http.post(BASE, async ({ request }) => {
    const body = await request.clone().json();
    return respond(
      request,
      { name: 'units.create', write: true, perform: (db, ctx) => createUnit(db, ctx, body) },
      { status: 201 },
    );
  }),
  ...['block', 'unblock'].map((action) =>
    http.post(`${BASE}/:id/${action}`, ({ request, params }) =>
      respond(request, {
        name: `units.${action}`,
        write: true,
        perform: (db, ctx) => actOnUnit(db, ctx, params.id, action),
      }),
    ),
  ),
];
