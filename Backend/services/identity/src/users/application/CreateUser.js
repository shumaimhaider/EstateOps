import { ConflictError, PERMISSION, assertCan } from '@estateops/kernel';
import { assertPasswordPolicy, createUser, normalizeEmail } from '../domain/user.js';

/**
 * Adds a staff account. Needs permissions.manage. Returns the authenticator secret once.
 * input: { actor, email, name, role, password }
 */
export class CreateUser {
  constructor({ uow, hasher, totp }) {
    Object.assign(this, { uow, hasher, totp });
  }

  async execute({ actor, email, name, role, password }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    assertPasswordPolicy(password);
    const totpSecret = this.totp.generateSecret();
    const user = createUser({
      tenantId: actor.tenantId,
      email,
      name,
      role,
      passwordHash: await this.hasher.hash(password),
      totpSecret,
    });
    return this.uow.run(async (repos) => {
      if (await repos.users.findByEmail(normalizeEmail(email))) {
        throw new ConflictError('EMAIL_TAKEN', 'That email already has an account');
      }
      const stored = await repos.users.insert(user);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'user.create',
        subjectType: 'user',
        subjectId: user.id,
        after: { email: user.email, role: user.role },
      });
      return { user: stored, totpSecret };
    });
  }
}
