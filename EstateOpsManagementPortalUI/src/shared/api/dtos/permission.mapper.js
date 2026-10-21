/** @returns {import('../../../features/permissions/domain/permission.model.js').RoleAccess} */
export const roleFromApi = (dto) => ({
  role: dto.role,
  permissions: dto.permissions,
  locked: dto.locked,
});

/** @returns {import('../../../features/permissions/domain/permission.model.js').PermissionMatrix} */
export function matrixFromApi(dto) {
  return {
    catalog: dto.catalog.map(({ key, group }) => ({ key, group })),
    roles: dto.roles.map(roleFromApi),
  };
}

export const rolePermissionsToApi = (permissions) => ({ permissions });
