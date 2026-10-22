import { isNonEmptyString, newId, validator } from '@estateops/kernel';

function check(f) {
  const v = validator('The payment plan could not be saved');
  if (f.name !== undefined) v.check(isNonEmptyString(f.name, 80), 'name', 'Name is required');
  if (f.downPct !== undefined)
    v.check(
      Number.isInteger(f.downPct) && f.downPct >= 0 && f.downPct <= 100,
      'down_pct',
      'Down payment must be 0 to 100 percent',
    );
  if (f.installmentCount !== undefined) {
    v.check(
      Number.isInteger(f.installmentCount) && f.installmentCount >= 1 && f.installmentCount <= 120,
      'installment_count',
      'Use 1 to 120 monthly installments',
    );
  }
  v.done();
}

/** A named schedule: a down payment percentage plus a number of equal monthly installments. */
export function createPlan({ tenantId, name, downPct, installmentCount }, { id = newId() } = {}) {
  check({ name: name ?? '', downPct: downPct ?? -1, installmentCount: installmentCount ?? 0 });
  return { id, tenantId, name: name.trim(), downPct, installmentCount, version: 1 };
}

export function updatePlan(plan, patch) {
  check(patch);
  return {
    ...plan,
    name: patch.name !== undefined ? patch.name.trim() : plan.name,
    downPct: patch.downPct ?? plan.downPct,
    installmentCount: patch.installmentCount ?? plan.installmentCount,
  };
}
