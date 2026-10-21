import { http } from 'msw';
import { listRolePermissions, updateRolePermissions } from '../../engine/permissions.js';
import { respond } from './respond.js';

const BASE = '*/api/v1/admin/permissions';

export const permissionRestHandlers = [
  http.get(BASE, ({ request }) =>
    respond(request, {
      name: 'permissions.list',
      perform: (db, ctx) => listRolePermissions(db, ctx),
    }),
  ),
  http.put(`${BASE}/:role`, async ({ request, params }) => {
    const body = await request.clone().json();
    return respond(request, {
      name: 'permissions.update',
      write: true,
      perform: (db, ctx) => updateRolePermissions(db, ctx, params.role, body),
    });
  }),
];
