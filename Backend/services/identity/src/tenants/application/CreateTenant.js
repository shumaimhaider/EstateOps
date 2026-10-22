import { ConflictError, ROLES, DEFAULT_ROLE_PERMISSIONS, fieldError } from '@estateops/kernel';
import { assertPasswordPolicy, createUser } from '../../users/domain/user.js';
import { createTenant } from '../domain/tenant.js';
import { tenantUpserted } from './events.js';

/**
 * Bootstraps a tenant: the tenant, default permissions for every role, and its first owner.
 * Returns the owner's authenticator secret once, so the owner can enrol their device.
 * input: { slug, name, currency, locale, timeZone, areaUnit, owner: { email, name, password } }
 */
export class CreateTenant {
  constructor({ uow, hasher, totp, clock }) {
    Object.assign(this, { uow, hasher, totp, clock });
  }

  async execute(input) {
    const tenant = createTenant(input);
    if (!input.owner) throw fieldError('owner', 'The first owner is required');
    assertPasswordPolicy(input.owner.password, 'owner.password');
    const totpSecret = this.totp.generateSecret();
    const owner = createUser({
      tenantId: tenant.id,
      email: input.owner.email,
      name: input.owner.name,
      role: 'owner',
      passwordHash: await this.hasher.hash(input.owner.password),
      totpSecret,
    });

    return this.uow.run(async (repos) => {
      if (await repos.tenants.findBySlug(tenant.slug)) {
        throw new ConflictError('SLUG_TAKEN', 'That tenant short name is already used');
      }
      if (await repos.users.findByEmail(owner.email)) {
        throw new ConflictError('EMAIL_TAKEN', 'That email already has an account');
      }
      await repos.tenants.insert(tenant);
      for (const role of ROLES) {
        await repos.rolePermissions.replace(tenant.id, role, DEFAULT_ROLE_PERMISSIONS[role]);
      }
      await repos.users.insert(owner);
      await repos.audit.record({
        tenantId: tenant.id,
        actor: { userId: owner.id, name: owner.name },
        action: 'tenant.create',
        subjectType: 'tenant',
        subjectId: tenant.id,
        after: { slug: tenant.slug, owner: owner.email },
      });
      await repos.outbox.add(tenantUpserted(tenant, this.clock.now()));
      return { tenant, owner, totpSecret };
    });
  }
}
