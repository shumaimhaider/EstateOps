import {
  ALL_PERMISSIONS,
  LOCKED_ROLES,
  ROLES,
  ConflictError,
  NotFoundError,
  validator,
} from '@estateops/kernel';

export const isLocked = (role) => LOCKED_ROLES.includes(role);

/**
 * Validates a new permission list for a role and returns it in catalogue order without
 * duplicates. Owner and admin always hold everything, so they cannot be edited.
 */
export function planRolePermissions(role, requested) {
  if (!ROLES.includes(role)) throw new NotFoundError('Role not found');
  if (isLocked(role)) {
    throw new ConflictError('ROLE_LOCKED', 'Owner and admin always keep every permission');
  }
  const v = validator('The permissions could not be saved');
  v.check(
    Array.isArray(requested) && requested.every((key) => ALL_PERMISSIONS.includes(key)),
    'permissions',
    'Unknown permission',
  );
  v.done();
  return ALL_PERMISSIONS.filter((key) => requested.includes(key));
}
