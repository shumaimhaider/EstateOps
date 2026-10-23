import { ApiError } from '@/shared/api/ApiError.js';
import { configureAuthLink, tokenStore } from '@/shared/api/authLink.js';
import { parseDto } from '@/shared/api/contract.js';
import {
  customerDtoSchema,
  profileDtoSchema,
  sessionDtoSchema,
  setPasswordDtoSchema,
  tokensDtoSchema,
} from '@/shared/api/dtos/auth.dto.js';
import {
  customerFromApi,
  fieldErrorsFromApi,
  profileFromApi,
  sessionFromApi,
} from '@/shared/api/dtos/auth.mapper.js';
import { httpClient } from '@/shared/api/httpClient.js';

async function withFieldErrors(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
    throw error;
  }
}

/** Customer sign-in, session restore, refresh, sign-out and the password flows. Tokens live in the shared auth link. */
export function createAuthRepository({ http = httpClient } = {}) {
  // Refresh tokens work once: two callers asking at the same moment (a reload starts several
  // requests, React may run an effect twice) must share one refresh, not race for the token.
  let refreshing = null;
  async function refreshTokens() {
    const refresh = tokenStore.getRefresh();
    if (!refresh) return null;
    refreshing ??= http
      .post('/portal/auth/refresh', { refresh_token: refresh })
      .then((raw) => {
        const tokens = parseDto(tokensDtoSchema, raw, 'tokens');
        tokenStore.set(tokens.access_token, tokens.refresh_token);
        return { access: tokens.access_token, refresh: tokens.refresh_token };
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  return {
    async login({ tenant, email, password }) {
      const session = sessionFromApi(
        parseDto(
          sessionDtoSchema,
          await withFieldErrors(http.post('/portal/auth/login', { tenant, email, password })),
          'session',
        ),
      );
      tokenStore.set(session.accessToken, session.refreshToken);
      return session.customer;
    },
    /** The signed-in customer; refreshes the access token first when only a refresh token survives a reload. */
    async restoreSession({ signal } = {}) {
      if (!tokenStore.getAccess()) {
        if (!tokenStore.getRefresh())
          throw new ApiError({
            code: 'UNAUTHENTICATED',
            message: 'Sign in to continue',
            status: 401,
          });
        await refreshTokens();
      }
      return customerFromApi(
        parseDto(customerDtoSchema, await http.get('/portal/auth/me', { signal }), 'customer'),
      );
    },
    async logout() {
      const refresh = tokenStore.getRefresh();
      try {
        if (refresh) await http.post('/portal/auth/logout', { refresh_token: refresh });
      } finally {
        tokenStore.clear();
      }
    },
    async forgotPassword({ tenant, email }) {
      await withFieldErrors(http.post('/portal/auth/forgot-password', { tenant, email }));
    },
    /** From an invitation or reset link. Returns where to sign in afterwards. */
    async setPassword({ token, password }) {
      const done = parseDto(
        setPasswordDtoSchema,
        await withFieldErrors(http.post('/portal/auth/set-password', { token, password })),
        'password',
      );
      return { tenant: done.tenant, email: done.email };
    },
    async changePassword({ currentPassword, newPassword }) {
      await withFieldErrors(
        http.post('/portal/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        }),
      );
      // every other device was signed out; this one's refresh token ended too
      tokenStore.clear();
    },
    async profile({ signal } = {}) {
      return profileFromApi(
        parseDto(profileDtoSchema, await http.get('/portal/profile', { signal }), 'profile'),
      );
    },
    /** Registers refresh-on-401 and the sign-out-on-failure callback with the shared auth link. */
    attachAuthLink({ onFailure }) {
      configureAuthLink({
        refresh: refreshTokens,
        onFailure: () => {
          tokenStore.clear();
          onFailure();
        },
      });
    },
  };
}

export const authRepository = createAuthRepository();
