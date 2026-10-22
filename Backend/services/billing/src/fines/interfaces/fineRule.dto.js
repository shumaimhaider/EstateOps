import { z } from 'zod';
import { toIso } from '@estateops/kernel';

export const saveFineRuleRequest = z.object({
  scope: z.string(),
  scope_id: z.string().nullable().optional(),
  unit_kind: z.string().nullable().optional(),
  kind: z.string(),
  value: z.number(),
});
export const effectiveQuery = z.object({
  scope: z.string(),
  scope_id: z.string().optional(),
  unit_kind: z.string().optional(),
});

export const toRuleResponse = ({ rule, currency, scopeName, allowedActions }, tenantId) => ({
  id: rule.id,
  tenant_id: tenantId,
  scope: rule.scope,
  scope_id: rule.scopeId,
  scope_name: scopeName,
  unit_kind: rule.unitKind,
  kind: rule.kind,
  value: rule.value,
  currency,
  allowed_actions: allowedActions,
  updated_at: toIso(rule.updatedAt),
  updated_by_name: rule.updatedByName ?? null,
});

export const toEffectiveResponse = (e, tenantId) => ({
  rule: toRuleResponse(e, tenantId),
  inherited: e.inherited,
  scope: e.scope,
  scope_id: e.scopeId,
  unit_kind: e.unitKind,
  allowed_actions: e.effectiveActions,
});
