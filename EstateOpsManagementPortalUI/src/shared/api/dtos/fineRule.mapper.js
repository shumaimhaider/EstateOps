import { money } from '../../lib/money.js';

const FIELD_TO_WIRE = {
  scope: 'scope',
  scopeId: 'scope_id',
  unitKind: 'unit_kind',
  kind: 'kind',
  rate: 'value',
};
const WIRE_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_WIRE).map(([k, v]) => [v, k]));

/** @returns {import('../../../features/fines/domain/fineRule.model.js').FineRule} */
export function fromApi(dto) {
  return {
    id: dto.id,
    scope: dto.scope,
    scopeId: dto.scope_id,
    scopeName: dto.scope_name,
    unitKind: dto.unit_kind,
    kind: dto.kind,
    percent: dto.kind === 'percent' ? dto.value / 100 : null,
    amount: dto.kind === 'fixed' ? money(dto.value, dto.currency) : null,
    currency: dto.currency,
    allowedActions: dto.allowed_actions,
    updatedAt: dto.updated_at,
    updatedByName: dto.updated_by_name,
  };
}

/** @returns {import('../../../features/fines/domain/fineRule.model.js').EffectiveFineRule} */
export function effectiveFromApi(dto) {
  return {
    rule: fromApi(dto.rule),
    inherited: dto.inherited,
    scope: dto.scope,
    scopeId: dto.scope_id,
    unitKind: dto.unit_kind,
    allowedActions: dto.allowed_actions,
  };
}

/** @param {{ scope: string, scopeId: string|null, unitKind?: string|null, kind: string, percent?: number, amountMinor?: number }} rule */
export function toApi(rule) {
  return {
    scope: rule.scope,
    scope_id: rule.scopeId ?? null,
    unit_kind: rule.unitKind ?? null,
    kind: rule.kind,
    value: rule.kind === 'percent' ? Math.round(rule.percent * 100) : rule.amountMinor,
  };
}

export const effectiveParamsToApi = ({ scope, scopeId, unitKind }) => ({
  scope,
  scope_id: scopeId ?? undefined,
  unit_kind: unitKind ?? undefined,
});

export function fieldErrorsFromApi(fieldErrors) {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [
      wire === 'value' ? 'rate' : (WIRE_TO_FIELD[wire] ?? wire),
      message,
    ]),
  );
}
