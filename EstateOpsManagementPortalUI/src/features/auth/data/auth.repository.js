import { z } from 'zod';
import { ApiError } from '@/shared/api/ApiError.js';
import { configureAuthLink, tokenStore } from '@/shared/api/authLink.js';
import { parseDto } from '@/shared/api/contract.js';
import {
  devAccountDtoSchema,
  logoutDtoSchema,
  mfaChallengeDtoSchema,
  sessionDtoSchema,
  tokensDtoSchema,
  userDtoSchema,
} from '@/shared/api/dtos/auth.dto.js';
import {
  challengeFromApi,
  devAccountFromApi,
  fieldErrorsFromApi,
  googleToApi,
  loginToApi,
  refreshToApi,
  sessionFromApi,
  tokensFromApi,
  userFromApi,
  verifyToApi,
} from '@/shared/api/dtos/auth.mapper.js';
import { resolveTransport } from '@/shared/config/transport.config.js';
import { authGraphql } from './transport/auth.graphql.js';
import { authRest } from './transport/auth.rest.js';

/** Sign-in, session restore, refresh and sign-out. Stores tokens in the shared auth link. */
export function createAuthRepository({
  transports = { rest: authRest, graphql: authGraphql },
  pickTransport = () => resolveTransport('auth'),
} = {}) {
  const t = () => transports[pickTransport()];

  async function withFieldErrors(promise) {
    try {
      return await promise;
    } catch (error) {
      if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
      throw error;
    }
  }

  function startSession(raw) {
    const session = sessionFromApi(parseDto(sessionDtoSchema, raw, 'session'));
    tokenStore.set(session.tokens.access, session.tokens.refresh);
    return session;
  }

  async function refreshTokens() {
    const refresh = tokenStore.getRefresh();
    if (!refresh) return null;
    const raw = await t().refresh(refreshToApi(refresh));
    const tokens = tokensFromApi(parseDto(tokensDtoSchema, raw, 'tokens'));
    tokenStore.set(tokens.access, tokens.refresh);
    return tokens;
  }

  return {
    async login(credentials) {
      const raw = await withFieldErrors(t().login(loginToApi(credentials)));
      return challengeFromApi(parseDto(mfaChallengeDtoSchema, raw, 'mfa challenge'));
    },
    async verifyCode(input) {
      return startSession(await withFieldErrors(t().verify(verifyToApi(input))));
    },
    async loginWithGoogle(idToken) {
      return startSession(await t().google(googleToApi(idToken)));
    },
    /** Current user; refreshes the access token first when only a refresh token survives a reload. */
    async restoreSession({ signal } = {}) {
      if (!tokenStore.getAccess()) {
        if (!tokenStore.getRefresh()) {
          throw new ApiError({
            code: 'UNAUTHENTICATED',
            message: 'Sign in to continue',
            status: 401,
          });
        }
        await refreshTokens();
      }
      return userFromApi(parseDto(userDtoSchema, await t().me({ signal }), 'user'));
    },
    async logout() {
      try {
        parseDto(logoutDtoSchema, await t().logout(), 'logout');
      } finally {
        tokenStore.clear();
      }
    },
    async devAccounts() {
      const raw = await t().devAccounts();
      return parseDto(z.array(devAccountDtoSchema), raw, 'dev accounts').map(devAccountFromApi);
    },
    /** Registers refresh-on-401 and the sign-out-on-failure callback with the shared auth link. */
    attachAuthLink({ onFailure }) {
      configureAuthLink({
        refresh: async () => {
          const tokens = await refreshTokens();
          return tokens && { access: tokens.access, refresh: tokens.refresh };
        },
        onFailure: () => {
          tokenStore.clear();
          onFailure();
        },
      });
    },
  };
}

export const authRepository = createAuthRepository();
