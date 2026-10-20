import { graphql } from 'msw';
import {
  devAccounts,
  googleLogin,
  login,
  refreshTokens,
  toUserDto,
  verifyCode,
} from '../../engine/auth.js';
import { respondGraphql } from './respond.js';

const publicMutation = (op, field, run, argName) =>
  graphql.mutation(op, ({ request, variables }) =>
    respondGraphql(request, {
      name: `auth.${field}`,
      isPublic: true,
      perform: (db) => ({ [field]: run(db, variables[argName]) }),
    }),
  );

export const authGraphqlHandlers = [
  publicMutation('Login', 'login', login, 'input'),
  publicMutation('Verify2fa', 'verify2fa', verifyCode, 'input'),
  publicMutation('GoogleLogin', 'googleLogin', googleLogin, 'input'),
  publicMutation('RefreshToken', 'refreshToken', refreshTokens, 'input'),
  graphql.mutation('Logout', ({ request }) =>
    respondGraphql(request, {
      name: 'auth.logout',
      isPublic: true,
      perform: () => ({ logout: { ok: true } }),
    }),
  ),
  graphql.query('Me', ({ request }) =>
    respondGraphql(request, {
      name: 'auth.me',
      perform: (db, ctx) => ({
        me: toUserDto(
          db,
          db.users.find((u) => u.id === ctx.user.id),
        ),
      }),
    }),
  ),
  graphql.query('DevAccounts', ({ request }) =>
    respondGraphql(request, {
      name: 'auth.devAccounts',
      isPublic: true,
      perform: (db) => ({ devAccounts: devAccounts(db) }),
    }),
  ),
];
