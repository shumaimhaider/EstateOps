import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { assertPasswordPolicy, isActiveOwner, updateUser } from '../domain/user.js';

/**
 * Edits a staff account (name, role, active, password). A tenant always keeps one active owner.
 * input: { actor, id, patch: { name?, role?, active?, password? } }
 */
export class UpdateUser {
  constructor({ uow, hasher }) {
    Object.assign(this, { uow, hasher });
  }

  async execute({ actor, id, patch }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    if (patch.password !== undefined) assertPasswordPolicy(patch.password);
    const passwordHash =
      patch.password !== undefined ? await this.hasher.hash(patch.password) : undefined;

    return this.uow.run(async (repos) => {
      const current = await repos.users.findById(actor.tenantId, id);
      if (!current) throw new NotFoundError('User not found');
      const next = { ...updateUser(current, patch), ...(passwordHash ? { passwordHash } : {}) };

      if (isActiveOwner(current) && !isActiveOwner(next)) {
        const owners = await repos.users.countActiveOwners(actor.tenantId);
        if (owners <= 1)
          throw new ConflictError('LAST_OWNER', 'A tenant must keep at least one active owner');
      }
      const saved = await repos.users.update(next);
      if (!saved.active || passwordHash) await repos.refreshTokens.revokeAllForUser(saved.id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'user.update',
        subjectType: 'user',
        subjectId: id,
        before: { name: current.name, role: current.role, active: current.active },
        after: {
          name: saved.name,
          role: saved.role,
          active: saved.active,
          passwordChanged: Boolean(passwordHash),
        },
      });
      return saved;
    });
  }
}
