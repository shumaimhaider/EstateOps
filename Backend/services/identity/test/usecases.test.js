import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLES } from '@estateops/kernel';
import { eventsOfType } from '@estateops/platform/testing';
import { CreateTenant } from '../src/tenants/application/CreateTenant.js';
import { UpdateTenant } from '../src/tenants/application/UpdateTenant.js';
import { GetTenant } from '../src/tenants/application/GetTenant.js';
import { CreateUser } from '../src/users/application/CreateUser.js';
import { UpdateUser } from '../src/users/application/UpdateUser.js';
import { DeactivateUser } from '../src/users/application/DeactivateUser.js';
import { ListUsers } from '../src/users/application/ListUsers.js';
import { GetUser } from '../src/users/application/GetUser.js';
import { ListRolePermissions } from '../src/permissions/application/ListRolePermissions.js';
import { UpdateRolePermissions } from '../src/permissions/application/UpdateRolePermissions.js';
import { Login } from '../src/auth/application/Login.js';
import { VerifyTwoFactor } from '../src/auth/application/VerifyTwoFactor.js';
import { RefreshSession } from '../src/auth/application/RefreshSession.js';
import { Logout } from '../src/auth/application/Logout.js';
import { GetMe } from '../src/auth/application/GetMe.js';
import { TENANT_INPUT, buildIdentityTest } from './fakes.js';

const actorOf = (user, tenantId, permissions) => ({
  tenantId,
  userId: user.id,
  name: user.name,
  role: user.role,
  permissions: permissions ?? DEFAULT_ROLE_PERMISSIONS[user.role],
});

describe('identity use cases', () => {
  let t;
  let owner;
  let tenant;
  let admin;
  const reset = async () => {
    t = await buildIdentityTest();
    ({ tenant, owner } = await new CreateTenant(t.deps).execute(TENANT_INPUT));
    admin = actorOf(owner, tenant.id);
  };
  beforeEach(reset);

  describe('CreateTenant', () => {
    it('creates the tenant, default grants for all ten roles, and the first owner', async () => {
      expect(t.stores.tenants.get(tenant.id)).toMatchObject({ slug: 'pk', currency: 'PKR' });
      expect(owner).toMatchObject({ role: 'owner', email: 'owner@pk.test', tenantId: tenant.id });
      expect(owner.passwordHash).toMatch(/^scrypt\$/);
      for (const role of ROLES) {
        expect(await t.repos.rolePermissions.get(tenant.id, role)).toEqual(
          DEFAULT_ROLE_PERMISSIONS[role],
        );
      }
    });
    it('audits it and announces it to the other services', () => {
      expect(t.auditEntries.map((a) => a.action)).toEqual(['tenant.create']);
      const [event] = eventsOfType(t.events, 'tenant.upserted');
      expect(event).toMatchObject({
        tenant_id: tenant.id,
        producer: 'identity',
        data: { slug: 'pk', currency: 'PKR', time_zone: 'Asia/Karachi' },
      });
    });
    it('returns the authenticator secret once and never stores a plain password', async () => {
      const again = await buildIdentityTest();
      const result = await new CreateTenant(again.deps).execute({
        ...TENANT_INPUT,
        slug: 'ae',
        owner: { ...TENANT_INPUT.owner, email: 'o@ae.test' },
      });
      expect(result.totpSecret).toMatch(/^[A-Z2-7]{32}$/);
      expect(JSON.stringify([...again.stores.users.values()])).not.toContain('Passw0rd!');
    });
    it('refuses a duplicate slug or email, and a weak owner password', async () => {
      const create = (patch) => new CreateTenant(t.deps).execute({ ...TENANT_INPUT, ...patch });
      await expect(create({})).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
      await expect(create({ slug: 'ae' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
      await expect(
        create({
          slug: 'ae',
          owner: { ...TENANT_INPUT.owner, email: 'x@y.test', password: 'weak' },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(create({ slug: 'ae', owner: undefined })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('tenant settings', () => {
    it('reads and updates the own tenant, announcing the change', async () => {
      expect((await new GetTenant(t.deps).execute({ actor: admin })).slug).toBe('pk');
      const saved = await new UpdateTenant(t.deps).execute({
        actor: admin,
        patch: { name: 'Zameen Group', areaUnit: 'kanal' },
      });
      expect(saved).toMatchObject({
        name: 'Zameen Group',
        areaUnit: 'kanal',
        currency: 'PKR',
        version: 2,
      });
      expect(eventsOfType(t.events, 'tenant.upserted')).toHaveLength(2);
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'tenant.update',
        before: { name: 'Zameen Developers' },
      });
    });
    it('needs permissions.manage', async () => {
      const agent = { ...admin, permissions: DEFAULT_ROLE_PERMISSIONS.sales_agent };
      await expect(
        new UpdateTenant(t.deps).execute({ actor: agent, patch: { name: 'x' } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('users', () => {
    const newUser = (over = {}) => ({
      actor: admin,
      email: 'fin@pk.test',
      name: 'Fiona Finance',
      role: 'finance',
      password: 'Passw0rd!',
      ...over,
    });

    it('creates a user in the actor tenant and audits it', async () => {
      const { user, totpSecret } = await new CreateUser(t.deps).execute(newUser());
      expect(user).toMatchObject({ tenantId: tenant.id, role: 'finance', active: true });
      expect(totpSecret).toMatch(/^[A-Z2-7]{32}$/);
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'user.create', subjectId: user.id });
    });
    it('refuses a duplicate email, weak password and unknown role', async () => {
      await new CreateUser(t.deps).execute(newUser());
      await expect(new CreateUser(t.deps).execute(newUser())).rejects.toMatchObject({
        code: 'EMAIL_TAKEN',
      });
      await expect(
        new CreateUser(t.deps).execute(newUser({ email: 'b@pk.test', password: 'nope' })),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        new CreateUser(t.deps).execute(newUser({ email: 'c@pk.test', role: 'wizard' })),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
    it('is for people who manage permissions only', async () => {
      const agent = { ...admin, permissions: DEFAULT_ROLE_PERMISSIONS.finance };
      for (const run of [
        () => new CreateUser(t.deps).execute(newUser({ actor: agent })),
        () => new ListUsers(t.deps).execute({ actor: agent }),
        () => new GetUser(t.deps).execute({ actor: agent, id: owner.id }),
        () => new UpdateUser(t.deps).execute({ actor: agent, id: owner.id, patch: { name: 'x' } }),
        () => new DeactivateUser(t.deps).execute({ actor: agent, id: owner.id }),
      ]) {
        await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
    });
    it('lists with filters and keyset paging, and only within the tenant', async () => {
      for (const [i, role] of ['finance', 'support', 'finance'].entries()) {
        await new CreateUser(t.deps).execute(
          newUser({ email: `u${i}@pk.test`, name: `User ${i}`, role }),
        );
      }
      const other = await new CreateTenant(t.deps).execute({
        ...TENANT_INPUT,
        slug: 'ae',
        owner: { ...TENANT_INPUT.owner, email: 'o@ae.test' },
      });
      expect(other.tenant.id).not.toBe(tenant.id);
      const all = await new ListUsers(t.deps).execute({ actor: admin });
      expect(all.items).toHaveLength(4);
      expect(
        (await new ListUsers(t.deps).execute({ actor: admin, role: 'finance' })).items,
      ).toHaveLength(2);
      expect(
        (await new ListUsers(t.deps).execute({ actor: admin, q: 'user 1' })).items.map(
          (u) => u.name,
        ),
      ).toEqual(['User 1']);
      const first = await new ListUsers(t.deps).execute({ actor: admin, limit: 3 });
      const second = await new ListUsers(t.deps).execute({
        actor: admin,
        limit: 3,
        cursor: first.nextCursor,
      });
      expect([...first.items, ...second.items]).toHaveLength(4);
      expect(second.nextCursor).toBeNull();
    });
    it('hides a user of another tenant', async () => {
      const other = await new CreateTenant(t.deps).execute({
        ...TENANT_INPUT,
        slug: 'ae',
        owner: { ...TENANT_INPUT.owner, email: 'o@ae.test' },
      });
      await expect(
        new GetUser(t.deps).execute({ actor: admin, id: other.owner.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new UpdateUser(t.deps).execute({ actor: admin, id: other.owner.id, patch: { name: 'x' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('keeps one active owner: demoting or deactivating the last one is refused', async () => {
      await expect(
        new UpdateUser(t.deps).execute({ actor: admin, id: owner.id, patch: { role: 'admin' } }),
      ).rejects.toMatchObject({ code: 'LAST_OWNER' });
      await expect(
        new UpdateUser(t.deps).execute({ actor: admin, id: owner.id, patch: { active: false } }),
      ).rejects.toMatchObject({ code: 'LAST_OWNER' });
      const { user: second } = await new CreateUser(t.deps).execute(
        newUser({ email: 'o2@pk.test', name: 'Second', role: 'owner' }),
      );
      const demoted = await new UpdateUser(t.deps).execute({
        actor: admin,
        id: owner.id,
        patch: { role: 'admin' },
      });
      expect(demoted.role).toBe('admin');
      await expect(
        new DeactivateUser(t.deps).execute({ actor: actorOf(owner, tenant.id), id: second.id }),
      ).rejects.toMatchObject({ code: 'LAST_OWNER' });
    });
    it('cannot deactivate yourself, and deactivation ends sessions', async () => {
      await expect(
        new DeactivateUser(t.deps).execute({ actor: admin, id: owner.id }),
      ).rejects.toMatchObject({ code: 'CANNOT_DEACTIVATE_SELF' });
      const { user } = await new CreateUser(t.deps).execute(newUser());
      t.stores.refresh.set('h', { id: 'r1', userId: user.id, tokenHash: 'h', usedAt: null });
      await new DeactivateUser(t.deps).execute({ actor: admin, id: user.id });
      expect(t.stores.users.get(user.id).active).toBe(false);
      expect(t.stores.refresh.get('h').usedAt).not.toBeNull();
      await new DeactivateUser(t.deps).execute({ actor: admin, id: user.id }); // repeat is harmless
      expect(t.auditEntries.filter((a) => a.action === 'user.deactivate')).toHaveLength(1);
    });
    it('changes a password and signs the person out everywhere', async () => {
      const { user } = await new CreateUser(t.deps).execute(newUser());
      t.stores.refresh.set('h', { id: 'r1', userId: user.id, tokenHash: 'h', usedAt: null });
      const saved = await new UpdateUser(t.deps).execute({
        actor: admin,
        id: user.id,
        patch: { password: 'N3wPassword' },
      });
      expect(await t.deps.hasher.verify('N3wPassword', saved.passwordHash)).toBe(true);
      expect(t.stores.refresh.get('h').usedAt).not.toBeNull();
      expect(JSON.stringify(t.auditEntries.at(-1))).not.toContain('N3wPassword');
    });
  });

  describe('role permissions', () => {
    it('lists the catalogue and every role, marking owner and admin locked', async () => {
      const { catalog, roles } = await new ListRolePermissions(t.deps).execute({ actor: admin });
      expect(catalog).toHaveLength(18);
      expect(roles.map((r) => r.role)).toEqual(ROLES);
      expect(roles.filter((r) => r.locked).map((r) => r.role)).toEqual(['owner', 'admin']);
      expect(roles.find((r) => r.role === 'admin').permissions).toEqual(ALL_PERMISSIONS);
    });
    it('saves a role, audits before and after, and refuses locked roles', async () => {
      const saved = await new UpdateRolePermissions(t.deps).execute({
        actor: admin,
        role: 'support',
        permissions: ['stats.view', 'dashboard.view'],
      });
      expect(saved).toEqual({
        role: 'support',
        permissions: ['dashboard.view', 'stats.view'],
        locked: false,
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'role.update_permissions',
        subjectId: 'support',
      });
      expect(t.auditEntries.at(-1).before.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.support);
      await expect(
        new UpdateRolePermissions(t.deps).execute({ actor: admin, role: 'owner', permissions: [] }),
      ).rejects.toMatchObject({ code: 'ROLE_LOCKED' });
    });
    it('needs permissions.manage', async () => {
      const finance = { ...admin, permissions: DEFAULT_ROLE_PERMISSIONS.finance };
      await expect(
        new ListRolePermissions(t.deps).execute({ actor: finance }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new UpdateRolePermissions(t.deps).execute({
          actor: finance,
          role: 'support',
          permissions: [],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('sign-in', () => {
    const login = (over = {}) =>
      new Login(t.deps).execute({
        email: 'owner@pk.test',
        password: 'Passw0rd!',
        ip: '1.2.3.4',
        ...over,
      });
    const secretOf = () => t.stores.users.get(owner.id).totpSecret;
    const goodCode = () => t.deps.totp.code(secretOf(), t.clock.now());
    const verify = (mfaToken, code = goodCode()) =>
      new VerifyTwoFactor(t.deps).execute({ mfaToken, code, ip: '1.2.3.4' });
    const signIn = async () => verify((await login()).mfaToken);

    it('signs in with password then a code, returning permissions in the token and the user', async () => {
      const session = await signIn();
      expect(session.user).toMatchObject({
        id: owner.id,
        role: 'owner',
        permissions: ALL_PERMISSIONS,
      });
      expect(session.tenant.slug).toBe('pk');
      const claims = await t.deps.verifier.verify(session.accessToken);
      expect(claims).toMatchObject({ userId: owner.id, tenantId: tenant.id, role: 'owner' });
      expect(claims.permissions).toEqual(ALL_PERMISSIONS);
      expect(session.refreshToken.length).toBeGreaterThan(40);
    });
    it('gives the role permissions saved by the admin', async () => {
      await new UpdateRolePermissions(t.deps).execute({
        actor: admin,
        role: 'support',
        permissions: ['dashboard.view', 'stats.view'],
      });
      const { user: support } = await new CreateUser(t.deps).execute({
        actor: admin,
        email: 's@pk.test',
        name: 'Sue',
        role: 'support',
        password: 'Passw0rd!',
      });
      const { mfaToken } = await login({ email: 's@pk.test' });
      const code = t.deps.totp.code(t.stores.users.get(support.id).totpSecret, t.clock.now());
      const session = await verify(mfaToken, code);
      expect((await t.deps.verifier.verify(session.accessToken)).permissions).toEqual([
        'dashboard.view',
        'stats.view',
      ]);
    });
    it('answers wrong email, wrong password and inactive user identically', async () => {
      const { user } = await new CreateUser(t.deps).execute({
        actor: admin,
        email: 'old@pk.test',
        name: 'Old',
        role: 'support',
        password: 'Passw0rd!',
      });
      await new DeactivateUser(t.deps).execute({ actor: admin, id: user.id });
      for (const attempt of [
        { email: 'ghost@pk.test' },
        { password: 'Wrong1234' },
        { email: 'old@pk.test' },
      ]) {
        await expect(login(attempt)).rejects.toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        });
      }
    });
    it('is case-insensitive on the email', async () => {
      await expect(login({ email: ' OWNER@PK.TEST ' })).resolves.toHaveProperty('mfaToken');
    });
    it('locks password attempts after 5 failures in 15 minutes, then recovers', async () => {
      for (let i = 0; i < 5; i += 1)
        await expect(login({ password: 'Wrong1234' })).rejects.toMatchObject({
          code: 'INVALID_CREDENTIALS',
        });
      await expect(login()).rejects.toMatchObject({
        code: 'TOO_MANY_ATTEMPTS',
        kind: 'rate_limited',
      });
      t.clock.advance(16 * 60_000);
      await expect(login()).resolves.toHaveProperty('mfaToken');
    });
    it('rejects a wrong code, counts it toward a lockout, and the failure survives the error', async () => {
      const { mfaToken } = await login();
      for (let i = 0; i < 5; i += 1) {
        await expect(verify(mfaToken, '000000')).rejects.toMatchObject({
          code: 'VALIDATION_ERROR',
        });
      }
      expect(t.stores.history.filter((h) => h.method === '2fa' && !h.success)).toHaveLength(5);
      await expect(verify(mfaToken)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    });
    it('lets a challenge be used once, and not after it expires or for a made-up id', async () => {
      const { mfaToken } = await login();
      await verify(mfaToken);
      await expect(verify(mfaToken)).rejects.toMatchObject({ code: 'INVALID_MFA_TOKEN' });
      const stale = (await login()).mfaToken;
      t.clock.advance(6 * 60_000);
      await expect(
        verify(stale, t.deps.totp.code(secretOf(), t.clock.now())),
      ).rejects.toMatchObject({ code: 'INVALID_MFA_TOKEN' });
      await expect(verify('not-a-token')).rejects.toMatchObject({ code: 'INVALID_MFA_TOKEN' });
    });
    it('rotates refresh tokens and treats reuse of an old one as theft, ending all sessions', async () => {
      const first = await signIn();
      const second = await new RefreshSession(t.deps).execute({ refreshToken: first.refreshToken });
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect((await t.deps.verifier.verify(second.accessToken)).userId).toBe(owner.id);
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: first.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      // the reuse revoked the newer token too, and that persisted despite the error
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: second.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });
    it('refuses a refresh for an expired token, unknown token or deactivated user', async () => {
      const session = await signIn();
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: 'nope' }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      const { user } = await new CreateUser(t.deps).execute({
        actor: admin,
        email: 'x@pk.test',
        name: 'X',
        role: 'support',
        password: 'Passw0rd!',
      });
      const { mfaToken } = await login({ email: 'x@pk.test' });
      const xs = await verify(
        mfaToken,
        t.deps.totp.code(t.stores.users.get(user.id).totpSecret, t.clock.now()),
      );
      await new DeactivateUser(t.deps).execute({ actor: admin, id: user.id });
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: xs.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      t.clock.advance(31 * 24 * 60 * 60_000);
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: session.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });
    it('logs out by ending the refresh token, and logging out twice is fine', async () => {
      const session = await signIn();
      await new Logout(t.deps).execute({ refreshToken: session.refreshToken });
      await new Logout(t.deps).execute({ refreshToken: session.refreshToken });
      await new Logout(t.deps).execute({});
      await expect(
        new RefreshSession(t.deps).execute({ refreshToken: session.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });
    it('returns the signed-in person with their tenant and the token permissions', async () => {
      const me = await new GetMe(t.deps).execute({ actor: admin });
      expect(me.user).toMatchObject({ id: owner.id, permissions: admin.permissions });
      expect(me.tenant.slug).toBe('pk');
      await expect(
        new GetMe(t.deps).execute({ actor: { ...admin, userId: 'missing' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
