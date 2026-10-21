import { describe, expect, it } from 'vitest';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { createPermissionsRepository } from './permissions.repository.js';

const repo = createPermissionsRepository();
const access = (matrix, name) => matrix.roles.find(({ role: id }) => id === name);

describe('role permissions', () => {
  it('shows the admin every permission and what each role holds', async () => {
    const matrix = await repo.list();
    expect(matrix.catalog.map((p) => p.key)).toContain('permissions.manage');
    expect(access(matrix, 'owner')).toMatchObject({ locked: true });
    expect(access(matrix, 'admin').permissions).toHaveLength(matrix.catalog.length);
    expect(access(matrix, 'sales_agent')).toMatchObject({ locked: false });
    expect(access(matrix, 'sales_agent').permissions).not.toContain('payments.record');
  });

  it('lets only roles with permissions.manage open the module', async () => {
    tokenStore.set(mockToken('pk', 'finance'));
    await expect(repo.list()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    tokenStore.set(mockToken('pk', 'admin'));
    await expect(repo.list()).resolves.toBeTruthy();
  });

  it('saves a role and the change reaches that role session', async () => {
    tokenStore.set(mockToken('pk', 'admin'));
    const before = access(await repo.list(), 'support').permissions;
    const saved = await repo.updateRole('support', [...before, 'stats.view']);
    expect(saved.permissions).toContain('stats.view');

    tokenStore.set(mockToken('pk', 'support'));
    const response = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${mockToken('pk', 'support')}` },
    });
    expect((await response.json()).permissions).toContain('stats.view');
    expect(getDb().audit.some((a) => a.action === 'role.update_permissions')).toBe(true);
  });

  it('keeps owner and admin locked, and rejects unknown permissions', async () => {
    await expect(repo.updateRole('admin', [])).rejects.toMatchObject({
      status: 409,
      code: 'ROLE_LOCKED',
    });
    await expect(repo.updateRole('support', ['nope.nothing'])).rejects.toMatchObject({
      status: 422,
    });
    await expect(repo.updateRole('ghost', [])).rejects.toMatchObject({ status: 404 });
  });

  it('applies to one tenant only', async () => {
    const db = getDb();
    await repo.updateRole('support', ['dashboard.view']);
    const [pk, ae] = db.tenants;
    expect(db.permissions[pk.id].support).toEqual(['dashboard.view']);
    expect(db.permissions[ae.id].support.length).toBeGreaterThan(1);
  });
});
