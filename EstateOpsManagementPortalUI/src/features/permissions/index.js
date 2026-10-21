/** Public surface of the permissions feature (what each role can see and do). */
export { default as RolePermissionsEditor } from './components/RolePermissionsEditor.jsx';
export { default as PermissionMatrix } from './components/PermissionMatrix.jsx';

export { usePermissionMatrixQuery } from './hooks/usePermissionMatrixQuery.js';
export { useUpdateRolePermissionsMutation } from './hooks/useUpdateRolePermissionsMutation.js';
export { permissionKeys } from './hooks/permissions.keys.js';
export { permissionMatrixShape } from './domain/permission.model.js';
