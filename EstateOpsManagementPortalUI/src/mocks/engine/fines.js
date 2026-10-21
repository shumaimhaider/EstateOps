import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { MockApiError } from './errors.js';
import { hasPermission, requirePermission } from './permissions.js';

/**
 * Late-fine rules. A rule is a percentage of the installment amount (`value` in basis points,
 * 200 = 2%) or a fixed amount per overdue installment (`value` in minor units). The most
 * specific rule wins. A customer, project or the default may also set a rate for one unit
 * category (plot, flat, villa, shop), so shops and home plots can be priced differently.
 * Order: customer+category, customer, property, project+category, project, default+category, default.
 */
export const FINE_SCOPES = ['default', 'project', 'unit', 'customer'];
export const UNIT_KINDS = ['plot', 'flat', 'villa', 'shop'];
const KINDS = ['percent', 'fixed'];
const MAX_BPS = 10_000;
const MAX_FIXED = 1_000_000_000_000;

export function seedFineRules(db, tenant) {
  db.fineRules.push({
    id: globalThis.crypto.randomUUID(),
    tenant_id: tenant.id,
    scope: 'default',
    scope_id: null,
    unit_kind: null,
    kind: 'percent',
    value: 200,
    updated_at: db.seededAt ?? null,
    updated_by_name: null,
  });
}

export function resolveRule(db, tenantId, { customerId, unitId, projectId, unitKind }) {
  const rules = db.fineRules.filter((r) => r.tenant_id === tenantId);
  const find = (scope, id, kind = null) =>
    rules.find((r) => r.scope === scope && r.scope_id === id && r.unit_kind === kind);
  return (
    (customerId && unitKind && find('customer', customerId, unitKind)) ||
    (customerId && find('customer', customerId)) ||
    (unitId && find('unit', unitId)) ||
    (projectId && unitKind && find('project', projectId, unitKind)) ||
    (projectId && find('project', projectId)) ||
    (unitKind && find('default', null, unitKind)) ||
    find('default', null)
  );
}

export function fineFor(rule, amount) {
  if (!rule) return 0;
  return rule.kind === 'percent' ? Math.round((amount * rule.value) / 10_000) : rule.value;
}

/** Re-prices the fine on every unpaid overdue installment of the tenant after a rule change. */
export function recomputeFines(db, tenantId) {
  const bookings = new Map(
    db.bookings.filter((b) => b.tenant_id === tenantId).map((b) => [b.id, b]),
  );
  const units = new Map(db.units.filter((u) => u.tenant_id === tenantId).map((u) => [u.id, u]));
  for (const row of db.installments) {
    if (row.tenant_id !== tenantId || row.status !== 'overdue') continue;
    const booking = bookings.get(row.booking_id);
    const unit = units.get(booking.unit_id);
    const rule = resolveRule(db, tenantId, {
      customerId: booking.customer_id,
      unitId: unit.id,
      projectId: unit.project_id,
      unitKind: unit.kind,
    });
    row.fine_amount = fineFor(rule, row.amount);
  }
}

function scopeName(db, rule) {
  if (rule.scope === 'default') return null;
  if (rule.scope === 'project') return db.projects.find((p) => p.id === rule.scope_id)?.name ?? '';
  if (rule.scope === 'customer') {
    return db.customers.find((c) => c.id === rule.scope_id)?.full_name ?? '';
  }
  const unit = db.units.find((u) => u.id === rule.scope_id);
  const project = unit && db.projects.find((p) => p.id === unit.project_id);
  return unit ? `${unit.unit_no} · ${project?.name ?? ''}` : '';
}

const ruleActions = (ctx, rule) =>
  hasPermission(ctx, 'fines.manage')
    ? rule.scope === 'default' && rule.unit_kind === null
      ? ['edit']
      : ['edit', 'delete']
    : [];

function toDto(db, ctx, rule) {
  return {
    id: rule.id,
    tenant_id: rule.tenant_id,
    scope: rule.scope,
    scope_id: rule.scope_id,
    scope_name: scopeName(db, rule),
    unit_kind: rule.unit_kind,
    kind: rule.kind,
    value: rule.value,
    currency: ctx.tenant.currency,
    allowed_actions: ruleActions(ctx, rule),
    updated_at: rule.updated_at,
    updated_by_name: rule.updated_by_name,
  };
}

export function listFineRules(db, ctx) {
  requirePermission(ctx, 'fines.view');
  const order = (r) =>
    FINE_SCOPES.indexOf(r.scope) * 10 + (r.unit_kind ? 1 + UNIT_KINDS.indexOf(r.unit_kind) : 0);
  const items = db.fineRules
    .filter((r) => r.tenant_id === ctx.tenant.id)
    .sort((a, b) => order(a) - order(b))
    .map((r) => toDto(db, ctx, r));
  return { items, cursors: items.map(() => ''), nextCursor: null };
}

function scopeExists(db, ctx, scope, scopeId) {
  const table = { project: db.projects, unit: db.units, customer: db.customers }[scope];
  return table.some((row) => row.id === scopeId && row.tenant_id === ctx.tenant.id);
}

function validate(db, ctx, body) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!FINE_SCOPES.includes(body.scope)) add('scope', 'Choose where this rate applies');
  else if (body.scope === 'default' && body.scope_id) add('scope_id', 'The default has no target');
  else if (body.scope !== 'default' && !scopeExists(db, ctx, body.scope, body.scope_id)) {
    add('scope_id', 'Choose an existing target');
  }
  const unitKind = body.unit_kind ?? null;
  if (unitKind !== null && !UNIT_KINDS.includes(unitKind)) {
    add('unit_kind', 'Choose a unit category');
  } else if (unitKind !== null && body.scope === 'unit') {
    add('unit_kind', 'A property has one category, so it takes one rate');
  }
  if (!KINDS.includes(body.kind)) add('kind', 'Choose percentage or fixed amount');
  const max = body.kind === 'percent' ? MAX_BPS : MAX_FIXED;
  if (!Number.isInteger(body.value) || body.value < 0 || body.value > max) {
    add(
      'value',
      body.kind === 'percent'
        ? 'Enter a percentage between 0 and 100'
        : 'Enter a fixed amount of zero or more',
    );
  }
  if (errors.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The fine rate could not be saved', errors);
  }
}

export function saveFineRule(db, ctx, body) {
  requirePermission(ctx, 'fines.manage');
  validate(db, ctx, body);
  const scopeId = body.scope === 'default' ? null : body.scope_id;
  const unitKind = body.unit_kind ?? null;
  let rule = db.fineRules.find(
    (r) =>
      r.tenant_id === ctx.tenant.id &&
      r.scope === body.scope &&
      r.scope_id === scopeId &&
      r.unit_kind === unitKind,
  );
  const before = rule ? { kind: rule.kind, value: rule.value } : null;
  if (!rule) {
    rule = {
      id: globalThis.crypto.randomUUID(),
      tenant_id: ctx.tenant.id,
      scope: body.scope,
      scope_id: scopeId,
      unit_kind: unitKind,
    };
    db.fineRules.push(rule);
  }
  Object.assign(rule, {
    kind: body.kind,
    value: body.value,
    updated_at: nowIso(db.clock),
    updated_by_name: ctx.user.name,
  });
  recomputeFines(db, ctx.tenant.id);
  appendAudit(db, {
    actor: ctx.user,
    action: 'fine_rule.save',
    subjectType: 'fine_rule',
    subjectId: rule.id,
    before,
    after: {
      scope: rule.scope,
      scope_id: rule.scope_id,
      unit_kind: rule.unit_kind,
      kind: rule.kind,
      value: rule.value,
    },
  });
  return toDto(db, ctx, rule);
}

export function deleteFineRule(db, ctx, id) {
  requirePermission(ctx, 'fines.manage');
  const rule = db.fineRules.find((r) => r.id === id && r.tenant_id === ctx.tenant.id);
  if (!rule) throw new MockApiError(404, 'NOT_FOUND', 'Fine rate not found');
  if (rule.scope === 'default' && rule.unit_kind === null) {
    throw new MockApiError(409, 'DEFAULT_RULE_REQUIRED', 'The default fine rate cannot be removed');
  }
  db.fineRules.splice(db.fineRules.indexOf(rule), 1);
  recomputeFines(db, ctx.tenant.id);
  appendAudit(db, {
    actor: ctx.user,
    action: 'fine_rule.delete',
    subjectType: 'fine_rule',
    subjectId: rule.id,
    before: { scope: rule.scope, scope_id: rule.scope_id, kind: rule.kind, value: rule.value },
  });
  return { ok: true };
}

/** The rate that applies at `scope`/`scope_id` (and unit category) once the override chain is walked. */
export function effectiveFineRule(db, ctx, { scope, scope_id: scopeId, unit_kind: kindParam }) {
  requirePermission(ctx, 'fines.view');
  if (
    !FINE_SCOPES.includes(scope) ||
    (scope !== 'default' && !scopeExists(db, ctx, scope, scopeId))
  ) {
    throw new MockApiError(404, 'NOT_FOUND', 'Nothing to price here');
  }
  if (kindParam && (!UNIT_KINDS.includes(kindParam) || scope === 'unit')) {
    throw new MockApiError(404, 'NOT_FOUND', 'Nothing to price here');
  }
  const target = { unitKind: kindParam || undefined };
  if (scope === 'project') target.projectId = scopeId;
  if (scope === 'customer') target.customerId = scopeId;
  if (scope === 'unit') {
    const unit = db.units.find((u) => u.id === scopeId);
    const booking = db.bookings.find((b) => b.unit_id === unit.id && b.status !== 'cancelled');
    Object.assign(target, {
      unitId: unit.id,
      projectId: unit.project_id,
      customerId: booking?.customer_id,
      unitKind: unit.kind,
    });
  }
  const rule = resolveRule(db, ctx.tenant.id, target);
  const inherited =
    rule.scope !== scope || (scope !== 'unit' && rule.unit_kind !== (kindParam || null));
  const manage = hasPermission(ctx, 'fines.manage');
  const removable = !inherited && !(scope === 'default' && !kindParam);
  return {
    rule: toDto(db, ctx, rule),
    inherited,
    scope,
    scope_id: scopeId ?? null,
    unit_kind: kindParam || null,
    allowed_actions: manage ? (removable ? ['set', 'clear'] : ['set']) : [],
  };
}
