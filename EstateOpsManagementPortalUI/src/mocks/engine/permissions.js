import { appendAudit } from './audit.js';
import { MockApiError } from './errors.js';

/**
 * Role permissions. The tenant admin decides which portal modules and actions each role gets.
 * Owner and admin are locked to everything so the tenant can never lock itself out.
 */
export const PERMISSION_CATALOG = [
  { key: 'dashboard.view', group: 'overview' },
  { key: 'stats.view', group: 'insights' },
  { key: 'escalations.view', group: 'insights' },
  { key: 'projects.view', group: 'inventory' },
  { key: 'units.view', group: 'inventory' },
  { key: 'sales.view', group: 'sales' },
  { key: 'customers.view', group: 'sales' },
  { key: 'payments.record', group: 'collections' },
  { key: 'payments.card', group: 'collections' },
  { key: 'invoices.adjust', group: 'collections' },
  { key: 'contracts.view', group: 'contracts' },
  { key: 'contracts.manage', group: 'contracts' },
  { key: 'fines.view', group: 'settings' },
  { key: 'fines.manage', group: 'settings' },
  { key: 'permissions.manage', group: 'settings' },
];

const ALL = PERMISSION_CATALOG.map((p) => p.key);
export const LOCKED_ROLES = ['owner', 'admin'];

const DEFAULTS = {
  owner: ALL,
  admin: ALL,
  sales_manager: [
    'dashboard.view',
    'stats.view',
    'escalations.view',
    'projects.view',
    'units.view',
    'sales.view',
    'customers.view',
    'payments.record',
    'contracts.view',
    'contracts.manage',
    'fines.view',
  ],
  sales_agent: [
    'dashboard.view',
    'projects.view',
    'units.view',
    'sales.view',
    'customers.view',
    'contracts.view',
  ],
  finance: [
    'dashboard.view',
    'stats.view',
    'escalations.view',
    'sales.view',
    'customers.view',
    'payments.record',
    'payments.card',
    'invoices.adjust',
    'contracts.view',
    'fines.view',
    'fines.manage',
  ],
  inventory_manager: ['dashboard.view', 'projects.view', 'units.view'],
  dealer_manager: ['dashboard.view', 'sales.view'],
  support: ['dashboard.view', 'sales.view', 'customers.view', 'contracts.view'],
  marketing: ['dashboard.view', 'projects.view', 'units.view'],
  auditor: [
    'dashboard.view',
    'stats.view',
    'escalations.view',
    'projects.view',
    'units.view',
    'sales.view',
    'customers.view',
    'contracts.view',
    'fines.view',
  ],
};

export function seedPermissions(db, tenant) {
  db.permissions ??= {};
  db.permissions[tenant.id] = Object.fromEntries(
    Object.entries(DEFAULTS).map(([role, keys]) => [role, [...keys]]),
  );
}

export const permissionsFor = (db, tenantId, role) => db.permissions?.[tenantId]?.[role] ?? [];

export const hasPermission = (ctx, key) => ctx.user.permissions.includes(key);

export function requirePermission(ctx, key) {
  if (!hasPermission(ctx, key)) {
    throw new MockApiError(403, 'FORBIDDEN', 'Your role does not allow this action');
  }
}

const roleDto = (db, tenantId, role) => ({
  role,
  permissions: permissionsFor(db, tenantId, role),
  locked: LOCKED_ROLES.includes(role),
});

export function listRolePermissions(db, ctx) {
  requirePermission(ctx, 'permissions.manage');
  return {
    catalog: PERMISSION_CATALOG,
    roles: Object.keys(db.permissions[ctx.tenant.id]).map((r) => roleDto(db, ctx.tenant.id, r)),
  };
}

export function updateRolePermissions(db, ctx, role, body) {
  requirePermission(ctx, 'permissions.manage');
  const current = db.permissions[ctx.tenant.id]?.[role];
  if (!current) throw new MockApiError(404, 'NOT_FOUND', 'Role not found');
  if (LOCKED_ROLES.includes(role)) {
    throw new MockApiError(409, 'ROLE_LOCKED', 'Owner and admin always keep every permission');
  }
  const next = body.permissions;
  if (!Array.isArray(next) || next.some((k) => !ALL.includes(k))) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The permissions could not be saved', [
      { field: 'permissions', message: 'Unknown permission' },
    ]);
  }
  const unique = ALL.filter((k) => next.includes(k));
  db.permissions[ctx.tenant.id][role] = unique;
  appendAudit(db, {
    actor: ctx.user,
    action: 'role.update_permissions',
    subjectType: 'role',
    subjectId: role,
    before: { permissions: current },
    after: { permissions: unique },
  });
  return roleDto(db, ctx.tenant.id, role);
}
