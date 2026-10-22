import { ROLES, isEmail, isNonEmptyString, newId, validator } from '@estateops/kernel';

export const normalizeEmail = (email) =>
  String(email ?? '')
    .trim()
    .toLowerCase();

/** At least 8 characters with a letter and a digit. */
export function assertPasswordPolicy(password, field = 'password') {
  const v = validator('The password is not strong enough');
  v.check(
    typeof password === 'string' &&
      password.length >= 8 &&
      password.length <= 128 &&
      /[A-Za-z]/.test(password) &&
      /\d/.test(password),
    field,
    'Use at least 8 characters with a letter and a digit',
  );
  v.done();
}

function check({ email, name, role }) {
  const v = validator('The user could not be saved');
  if (email !== undefined)
    v.check(isEmail(normalizeEmail(email)), 'email', 'Enter a valid email address');
  if (name !== undefined) v.check(isNonEmptyString(name, 120), 'name', 'Name is required');
  if (role !== undefined) v.check(ROLES.includes(role), 'role', 'Unknown role');
  v.done();
}

export function createUser(
  { tenantId, email, name, role, passwordHash, totpSecret },
  { id = newId() } = {},
) {
  check({ email: email ?? '', name: name ?? '', role: role ?? '' });
  return {
    id,
    tenantId,
    email: normalizeEmail(email),
    name: name.trim(),
    role,
    passwordHash,
    totpSecret,
    active: true,
    version: 1,
  };
}

export function updateUser(user, patch) {
  check({ name: patch.name, role: patch.role });
  return {
    ...user,
    name: patch.name !== undefined ? patch.name.trim() : user.name,
    role: patch.role ?? user.role,
    active: patch.active ?? user.active,
  };
}

/** Owners are the accounts of last resort: a tenant must always keep one active owner. */
export const isOwner = (user) => user.role === 'owner';
export const isActiveOwner = (user) => user.role === 'owner' && user.active;
