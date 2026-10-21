import { nowIso } from './clock.js';
import { MockApiError } from './errors.js';
import { permissionsFor } from './permissions.js';

/** Mock credentials: any seeded email with this password, then 2FA code 123456. */
export const MOCK_PASSWORD = 'Passw0rd!';
export const MOCK_2FA_CODE = '123456';

const findUser = (db, email) =>
  db.users.find(
    (u) =>
      u.email.toLowerCase() ===
      String(email ?? '')
        .trim()
        .toLowerCase(),
  );

export const tenantOf = (db, user) => db.tenants.find((t) => t.id === user.tenant_id);

function recordLogin(db, user, method, success) {
  db.loginHistory.push({
    id: globalThis.crypto.randomUUID(),
    tenant_id: user.tenant_id,
    user_id: user.id,
    method,
    success,
    ip: '10.0.0.7',
    created_at: nowIso(db.clock),
  });
}

export function toSessionDto(db, user) {
  const tenant = tenantOf(db, user);
  return {
    access_token: `mock.${tenant.slug}.${user.role}`,
    refresh_token: `refresh.${tenant.slug}.${user.role}`,
    user: toUserDto(db, user),
  };
}

export function toUserDto(db, user) {
  const tenant = tenantOf(db, user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: permissionsFor(db, user.tenant_id, user.role),
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      locale: tenant.locale,
      time_zone: tenant.time_zone,
      area_unit: tenant.area_unit,
    },
  };
}

export function login(db, { email, password }) {
  const user = findUser(db, email);
  if (!user || password !== MOCK_PASSWORD) {
    if (user) recordLogin(db, user, 'password', false);
    throw new MockApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  return { status: 'mfa_required', mfa_token: `mfa.${user.id}` };
}

export function verifyCode(db, { mfa_token: mfaToken, code }) {
  const user = db.users.find((u) => `mfa.${u.id}` === mfaToken);
  if (!user) throw new MockApiError(401, 'INVALID_MFA_TOKEN', 'Start sign-in again');
  if (code !== MOCK_2FA_CODE) {
    recordLogin(db, user, '2fa', false);
    throw new MockApiError(422, 'INVALID_CODE', 'That code is not valid', [
      { field: 'code', message: 'That code is not valid' },
    ]);
  }
  recordLogin(db, user, '2fa', true);
  return toSessionDto(db, user);
}

/** Google sign-in: the mock id token is `mock-google:<email>`; only registered staff may enter. */
export function googleLogin(db, { id_token: idToken }) {
  const email = /^mock-google:(.+)$/.exec(idToken ?? '')?.[1];
  const user = email && findUser(db, email);
  if (!user) {
    throw new MockApiError(
      403,
      'ACCOUNT_NOT_REGISTERED',
      'This Google account is not registered as staff for any tenant',
    );
  }
  recordLogin(db, user, 'google', true);
  return toSessionDto(db, user);
}

export function refreshTokens(db, { refresh_token: token }) {
  const match = /^refresh\.([a-z]+)\.([a-z_]+)$/.exec(token ?? '');
  const tenant = match && db.tenants.find((t) => t.slug === match[1]);
  const user = tenant && db.users.find((u) => u.tenant_id === tenant.id && u.role === match[2]);
  if (!user) throw new MockApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired');
  const { access_token, refresh_token } = toSessionDto(db, user);
  return { access_token, refresh_token };
}

export const devAccounts = (db) =>
  db.users.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    tenant_name: tenantOf(db, u).name,
  }));
