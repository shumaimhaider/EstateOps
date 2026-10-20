import { http } from 'msw';
import {
  devAccounts,
  googleLogin,
  login,
  refreshTokens,
  toUserDto,
  verifyCode,
} from '../../engine/auth.js';
import { respond } from './respond.js';

const BASE = '*/api/v1/auth';

const publicPost = (path, name, run) =>
  http.post(`${BASE}/${path}`, async ({ request }) => {
    const body = await request.clone().json();
    return respond(request, { name, isPublic: true, perform: (db) => run(db, body) });
  });

export const authRestHandlers = [
  publicPost('login', 'auth.login', login),
  publicPost('2fa', 'auth.2fa', verifyCode),
  publicPost('google', 'auth.google', googleLogin),
  publicPost('refresh', 'auth.refresh', refreshTokens),
  http.post(`${BASE}/logout`, ({ request }) =>
    respond(request, { name: 'auth.logout', isPublic: true, perform: () => ({ ok: true }) }),
  ),
  http.get(`${BASE}/me`, ({ request }) =>
    respond(request, {
      name: 'auth.me',
      perform: (db, ctx) =>
        toUserDto(
          db,
          db.users.find((u) => u.id === ctx.user.id),
        ),
    }),
  ),
  http.get(`${BASE}/dev-accounts`, ({ request }) =>
    respond(request, {
      name: 'auth.devAccounts',
      isPublic: true,
      perform: (db) => ({ data: devAccounts(db) }),
    }),
  ),
];
