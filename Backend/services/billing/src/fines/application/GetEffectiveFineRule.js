import { NotFoundError, PERMISSION, assertCan, can } from '@estateops/kernel';
import { FINE_SCOPES, UNIT_KINDS, resolveRule } from '../domain/rule.js';
import { ruleActions } from './rules.js';

/**
 * The rate that applies at a level (and category) once the override chain is walked, whether it is
 * inherited, and what the role may do about it. input: { actor, scope, scopeId, unitKind }
 */
export class GetEffectiveFineRule {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, scope, scopeId = null, unitKind = null }) {
    assertCan(actor, PERMISSION.FINES_VIEW);
    const missing = new NotFoundError('Nothing to price here');
    if (
      !FINE_SCOPES.includes(scope) ||
      (unitKind && (!UNIT_KINDS.includes(unitKind) || scope === 'unit'))
    )
      throw missing;
    return this.uow.read(async (repos) => {
      if (scope !== 'default' && !(await repos.fines.targetExists(actor.tenantId, scope, scopeId)))
        throw missing;
      const target = { unitKind: unitKind || undefined };
      if (scope === 'project') target.projectId = scopeId;
      if (scope === 'customer') target.customerId = scopeId;
      if (scope === 'unit') {
        const unit = await repos.fines.unitFacts(actor.tenantId, scopeId);
        Object.assign(target, {
          unitId: scopeId,
          projectId: unit.projectId,
          customerId: unit.customerId,
          unitKind: unit.kind,
        });
      }
      const rule = resolveRule(await repos.fines.list(actor.tenantId), target);
      const inherited =
        rule.scope !== scope || (scope !== 'unit' && rule.unitKind !== (unitKind || null));
      const manage = can(actor, PERMISSION.FINES_MANAGE);
      const removable = !inherited && !(scope === 'default' && !unitKind);
      return {
        rule,
        currency: (await repos.tenantRefs.get(actor.tenantId))?.currency ?? null,
        scopeName: await repos.fines.scopeName(actor.tenantId, rule),
        allowedActions: ruleActions(rule, actor),
        inherited,
        scope,
        scopeId,
        unitKind: unitKind || null,
        effectiveActions: manage ? (removable ? ['set', 'clear'] : ['set']) : [],
      };
    });
  }
}
