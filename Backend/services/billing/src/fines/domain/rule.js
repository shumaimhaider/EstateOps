import { newId, percentOfBps, validator } from '@estateops/kernel';

export const FINE_SCOPES = Object.freeze(['default', 'project', 'unit', 'customer']);
export const UNIT_KINDS = Object.freeze(['plot', 'flat', 'villa', 'shop']);
const KINDS = ['percent', 'fixed'];
const MAX_BPS = 10_000;
const MAX_FIXED = 1_000_000_000_000;

/**
 * Specificity, most specific first. The first rule found wins:
 * customer+category, customer, property, project+category, project, default+category, default.
 */
export const PRIORITY = Object.freeze([
  { scope: 'customer', withKind: true },
  { scope: 'customer', withKind: false },
  { scope: 'unit', withKind: false },
  { scope: 'project', withKind: true },
  { scope: 'project', withKind: false },
  { scope: 'default', withKind: true },
  { scope: 'default', withKind: false },
]);

/** A rule is a percentage of the installment amount (`value` in basis points) or a fixed amount per overdue installment. */
export function createRule(input, { id = newId() } = {}) {
  const v = validator('The fine rate could not be saved');
  const unitKind = input.unitKind ?? null;
  if (!FINE_SCOPES.includes(input.scope)) v.add('scope', 'Choose where this rate applies');
  else if (input.scope === 'default' && input.scopeId)
    v.add('scope_id', 'The default has no target');
  else if (input.scope !== 'default' && !input.scopeId)
    v.add('scope_id', 'Choose an existing target');
  if (unitKind !== null && !UNIT_KINDS.includes(unitKind))
    v.add('unit_kind', 'Choose a unit category');
  else if (unitKind !== null && input.scope === 'unit')
    v.add('unit_kind', 'A property has one category, so it takes one rate');
  if (!KINDS.includes(input.kind)) v.add('kind', 'Choose percentage or fixed amount');
  const max = input.kind === 'percent' ? MAX_BPS : MAX_FIXED;
  if (!Number.isSafeInteger(input.value) || input.value < 0 || input.value > max) {
    v.add(
      'value',
      input.kind === 'percent'
        ? 'Enter a percentage between 0 and 100'
        : 'Enter a fixed amount of zero or more',
    );
  }
  v.done();
  return {
    id,
    tenantId: input.tenantId,
    scope: input.scope,
    scopeId: input.scope === 'default' ? null : input.scopeId,
    unitKind,
    kind: input.kind,
    value: input.value,
    version: 1,
  };
}

/** Same level and category as `rule`? Saving replaces it instead of adding a second one. */
export const sameLevel = (a, b) =>
  a.scope === b.scope && a.scopeId === b.scopeId && a.unitKind === b.unitKind;

export const isRequiredDefault = (rule) => rule.scope === 'default' && rule.unitKind === null;

/** The fine for one overdue installment amount under a rule. Integer maths only. */
export const fineFor = (rule, amount) =>
  !rule ? 0 : rule.kind === 'percent' ? percentOfBps(amount, rule.value) : rule.value;

/** Picks the winning rule for a target. `rules` are all of a tenant's rules. Mirrors the SQL in the repository. */
export function resolveRule(rules, { customerId, unitId, projectId, unitKind }) {
  const find = (scope, id, kind) =>
    rules.find((r) => r.scope === scope && r.scopeId === id && r.unitKind === kind);
  for (const { scope, withKind } of PRIORITY) {
    if (withKind && !unitKind) continue;
    const id = { customer: customerId, unit: unitId, project: projectId, default: null }[scope];
    if (scope !== 'default' && !id) continue;
    const hit = find(scope, id ?? null, withKind ? unitKind : null);
    if (hit) return hit;
  }
  return null;
}
