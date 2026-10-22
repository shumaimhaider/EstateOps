import { describe, expect, it } from 'vitest';
import { ValidationError } from '@estateops/kernel';
import { createTenant, updateTenant } from '../src/tenants/domain/tenant.js';
import {
  assertPasswordPolicy,
  createUser,
  isActiveOwner,
  normalizeEmail,
  updateUser,
} from '../src/users/domain/user.js';
import { isLocked, planRolePermissions } from '../src/permissions/domain/rolePermissions.js';
import { MFA_TTL_MS, expiresIn, isExpired, windowStart } from '../src/auth/domain/session.js';
import { TENANT_INPUT } from './fakes.js';

const details = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};

describe('tenant', () => {
  it('creates a tenant at version 1 with a generated id', () => {
    const t = createTenant(TENANT_INPUT);
    expect(t).toMatchObject({ slug: 'pk', currency: 'PKR', areaUnit: 'marla', version: 1 });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('reports every bad field at once', () => {
    expect(
      details(() =>
        createTenant({
          slug: 'Bad Slug',
          name: ' ',
          currency: 'pkr',
          locale: '',
          timeZone: '',
          areaUnit: 'acre',
        }),
      ),
    ).toEqual(['slug', 'name', 'currency', 'locale', 'time_zone', 'area_unit']);
    expect(details(() => createTenant({}))).toContain('slug');
  });
  it('never changes the slug or currency on update', () => {
    const t = createTenant(TENANT_INPUT);
    const next = updateTenant(t, {
      name: ' New Name ',
      areaUnit: 'kanal',
      slug: 'hack',
      currency: 'USD',
    });
    expect(next).toMatchObject({
      name: 'New Name',
      areaUnit: 'kanal',
      slug: 'pk',
      currency: 'PKR',
    });
    expect(details(() => updateTenant(t, { areaUnit: 'acre' }))).toEqual(['area_unit']);
  });
});

describe('user', () => {
  const base = {
    tenantId: 't',
    email: ' Sam@Example.TEST ',
    name: ' Sam ',
    role: 'finance',
    passwordHash: 'h',
    totpSecret: 's',
  };
  it('normalises the email and trims the name', () => {
    expect(createUser(base)).toMatchObject({
      email: 'sam@example.test',
      name: 'Sam',
      active: true,
      version: 1,
    });
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co');
  });
  it('rejects bad email, name and role together', () => {
    expect(details(() => createUser({ ...base, email: 'nope', name: '', role: 'wizard' }))).toEqual(
      ['email', 'name', 'role'],
    );
  });
  it('applies a password policy of 8+ characters with a letter and a digit', () => {
    expect(() => assertPasswordPolicy('Passw0rd!')).not.toThrow();
    for (const bad of ['short1', 'allletters', '12345678', '', undefined]) {
      expect(() => assertPasswordPolicy(bad)).toThrow(ValidationError);
    }
  });
  it('knows active owners and updates only allowed fields', () => {
    const u = createUser({ ...base, role: 'owner' });
    expect(isActiveOwner(u)).toBe(true);
    expect(isActiveOwner({ ...u, active: false })).toBe(false);
    expect(updateUser(u, { role: 'admin', email: 'x@y.z' })).toMatchObject({
      role: 'admin',
      email: 'sam@example.test',
    });
  });
});

describe('role permissions', () => {
  it('returns permissions in catalogue order without duplicates', () => {
    expect(planRolePermissions('support', ['sales.view', 'dashboard.view', 'sales.view'])).toEqual([
      'dashboard.view',
      'sales.view',
    ]);
    expect(planRolePermissions('support', [])).toEqual([]);
  });
  it('refuses locked roles, unknown roles and unknown permissions', () => {
    expect(isLocked('owner')).toBe(true);
    expect(() => planRolePermissions('admin', [])).toThrow(
      expect.objectContaining({ code: 'ROLE_LOCKED' }),
    );
    expect(() => planRolePermissions('ghost', [])).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(() => planRolePermissions('support', ['nope.nope'])).toThrow(ValidationError);
    expect(() => planRolePermissions('support', 'dashboard.view')).toThrow(ValidationError);
  });
});

describe('session timings', () => {
  it('expires challenges and tokens at their deadline', () => {
    const now = new Date('2026-10-21T09:00:00Z');
    const at = expiresIn(MFA_TTL_MS, now);
    expect(isExpired(at, now)).toBe(false);
    expect(isExpired(at, new Date(now.getTime() + MFA_TTL_MS))).toBe(true);
    expect(windowStart(now).getTime()).toBe(now.getTime() - 15 * 60_000);
  });
});
