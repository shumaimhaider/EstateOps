import { PERMISSION, can } from '@estateops/kernel';
import { isRequiredDefault } from '../domain/rule.js';

/** `allowed_actions` of one configured rate for this role. */
export const ruleActions = (rule, actor) =>
  can(actor, PERMISSION.FINES_MANAGE)
    ? isRequiredDefault(rule)
      ? ['edit']
      : ['edit', 'delete']
    : [];

/** A rule with the name of what it applies to, for display. */
export async function withScopeName(repos, tenantId, rule) {
  return { rule, scopeName: await repos.fines.scopeName(tenantId, rule) };
}
