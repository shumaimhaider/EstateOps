import { parseDto } from '@/shared/api/contract.js';
import {
  permissionMatrixDtoSchema,
  rolePermissionDtoSchema,
} from '@/shared/api/dtos/permission.dto.js';
import {
  matrixFromApi,
  roleFromApi,
  rolePermissionsToApi,
} from '@/shared/api/dtos/permission.mapper.js';
import { permissionsRest } from './transport/permissions.rest.js';

/** Role permissions (REST only). Listing and editing are admin-only on the server. */
export function createPermissionsRepository({ transport = permissionsRest } = {}) {
  return {
    async list({ signal } = {}) {
      const raw = await transport.list({ signal });
      return matrixFromApi(parseDto(permissionMatrixDtoSchema, raw, 'permission matrix'));
    },
    async updateRole(role, permissions, { idempotencyKey } = {}) {
      const raw = await transport.updateRole(role, rolePermissionsToApi(permissions), {
        idempotencyKey,
      });
      return roleFromApi(parseDto(rolePermissionDtoSchema, raw, 'role permissions'));
    },
  };
}

export const permissionsRepository = createPermissionsRepository();
