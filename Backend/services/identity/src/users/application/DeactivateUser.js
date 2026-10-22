import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { isActiveOwner } from '../domain/user.js';

/** DELETE /users/:id. Accounts are deactivated, never erased: the audit trail keeps pointing at them. */
export class DeactivateUser {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.users.findById(actor.tenantId, id);
      if (!current) throw new NotFoundError('User not found');
      if (current.id === actor.userId) {
        throw new ConflictError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
      }
      if (isActiveOwner(current) && (await repos.users.countActiveOwners(actor.tenantId)) <= 1) {
        throw new ConflictError('LAST_OWNER', 'A tenant must keep at least one active owner');
      }
      if (current.active) {
        await repos.users.update({ ...current, active: false });
        await repos.refreshTokens.revokeAllForUser(id);
        await repos.audit.record({
          tenantId: actor.tenantId,
          actor,
          action: 'user.deactivate',
          subjectType: 'user',
          subjectId: id,
          before: { active: true },
          after: { active: false },
        });
      }
    });
  }
}
