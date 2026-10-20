import { http } from 'msw';
import { getProject, listProjects, projectMap } from '../../engine/projects.js';
import { respond, restPage } from './respond.js';

const BASE = '*/api/v1/admin/projects';

export const projectRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'projects.list',
      perform: (db, ctx) =>
        restPage(listProjects(db, ctx, Object.fromEntries(new URL(request.url).searchParams))),
    }),
  ),
  http.get(`${BASE}/:id`, ({ request, params }) =>
    respond(request, {
      name: 'projects.get',
      perform: (db, ctx) => getProject(db, ctx, params.id),
    }),
  ),
  http.get(`${BASE}/:id/map`, ({ request, params }) =>
    respond(request, {
      name: 'projects.map',
      perform: (db, ctx) => projectMap(db, ctx, params.id),
    }),
  ),
];
