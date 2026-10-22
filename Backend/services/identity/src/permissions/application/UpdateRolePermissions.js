import { PERMISSION, assertCan } from '@estateops/kernel';
import { isLocked, planRolePermissions } from '../domain/rolePermissions.js';

/** Saves the full permission list of one role. input: { actor, role, permissions } */
export class UpdateRolePermissions {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, role, permissions }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    const next = planRolePermissions(role, permissions);
    return this.uow.run(async (repos) => {
      const before = await repos.rolePermissions.get(actor.tenantId, role);
      await repos.rolePermissions.replace(actor.tenantId, role, next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'role.update_permissions',
        subjectType: 'role',
        subjectId: role,
        before: { permissions: before },
        after: { permissions: next },
      });
      return { role, permissions: next, locked: isLocked(role) };
    });
  }
}
