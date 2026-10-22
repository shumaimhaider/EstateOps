import { PERMISSION, PERMISSION_CATALOG, ROLES, assertCan } from '@estateops/kernel';
import { isLocked } from '../domain/rolePermissions.js';

/** The catalogue plus what every role holds. Admin and owner only (permissions.manage). */
export class ListRolePermissions {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    return this.uow.read(async (repos) => {
      const held = await repos.rolePermissions.allByRole(actor.tenantId);
      return {
        catalog: PERMISSION_CATALOG,
        roles: ROLES.map((role) => ({
          role,
          permissions: held[role] ?? [],
          locked: isLocked(role),
        })),
      };
    });
  }
}
