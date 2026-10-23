/**
 * @typedef {import('../../../features/auth/domain/auth.model.js').Session} Session
 * @typedef {import('../../../features/auth/domain/auth.model.js').User} User
 */

/** @returns {User} */
export function userFromApi(dto) {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    permissions: dto.permissions,
    tenant: {
      id: dto.tenant.id,
      slug: dto.tenant.slug,
      name: dto.tenant.name,
      currency: dto.tenant.currency,
      locale: dto.tenant.locale,
      timeZone: dto.tenant.time_zone,
      areaUnit: dto.tenant.area_unit,
    },
  };
}

/** @returns {Session} */
export function sessionFromApi(dto) {
  return {
    user: userFromApi(dto.user),
    tokens: { access: dto.access_token, refresh: dto.refresh_token },
  };
}

export const tokensFromApi = (dto) => ({ access: dto.access_token, refresh: dto.refresh_token });
export const challengeFromApi = (dto) => ({ mfaToken: dto.mfa_token });

export const loginToApi = ({ email, password }) => ({ email, password });
export const verifyToApi = ({ mfaToken, code }) => ({ mfa_token: mfaToken, code });
export const googleToApi = (idToken) => ({ id_token: idToken });
export const refreshToApi = (refreshToken) => ({ refresh_token: refreshToken });

/** Server field errors (wire names) -> form fields. */
export function fieldErrorsFromApi(fieldErrors) {
  const map = { mfa_token: 'code' };
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [map[wire] ?? wire, message]),
  );
}
