import { http } from 'msw';
import {
  deleteFineRule,
  effectiveFineRule,
  listFineRules,
  saveFineRule,
} from '../../engine/fines.js';
import { respond, restPage } from './respond.js';

const BASE = '*/api/v1/admin/fine-rules';
const query = (request) => Object.fromEntries(new URL(request.url).searchParams);

export const fineRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'fineRules.list',
      perform: (db, ctx) => restPage(listFineRules(db, ctx)),
    }),
  ),
  http.get(`${BASE}/effective`, ({ request }) =>
    respond(request, {
      name: 'fineRules.effective',
      perform: (db, ctx) => effectiveFineRule(db, ctx, query(request)),
    }),
  ),
  http.put(BASE, async ({ request }) => {
    const body = await request.clone().json();
    return respond(request, {
      name: 'fineRules.save',
      write: true,
      perform: (db, ctx) => saveFineRule(db, ctx, body),
    });
  }),
  http.delete(`${BASE}/:id`, ({ request, params }) =>
    respond(request, {
      name: 'fineRules.delete',
      write: true,
      perform: (db, ctx) => deleteFineRule(db, ctx, params.id),
    }),
  ),
];
