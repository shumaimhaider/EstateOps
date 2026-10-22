import { PERMISSION, assertCan, fieldError } from '@estateops/kernel';
import { createRule, sameLevel } from '../domain/rule.js';
import { fineRateChanged } from '../../installments/application/events.js';
import { filterFor, repriceScope } from './repriceScope.js';
import { ruleActions } from './rules.js';

/**
 * Sets the fine rate at one level and category, replacing any rate already there. A project,
 * customer or property rate re-prices its own overdue invoices straight away; a default rate
 * (every invoice may be affected) is re-priced in batches by the fine_rate.changed event.
 * input: { actor, scope, scopeId, unitKind, kind, value }
 */
export class SaveFineRule {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, ...input }) {
    assertCan(actor, PERMISSION.FINES_MANAGE);
    const rule = createRule({ tenantId: actor.tenantId, ...input });
    return this.uow.run(async (repos) => {
      if (
        rule.scope !== 'default' &&
        !(await repos.fines.targetExists(actor.tenantId, rule.scope, rule.scopeId))
      ) {
        throw fieldError(
          'scope_id',
          'Choose an existing target',
          'The fine rate could not be saved',
        );
      }
      const existing = (await repos.fines.list(actor.tenantId)).find((r) => sameLevel(r, rule));
      const before = existing ? { kind: existing.kind, value: existing.value } : null;
      const saved = existing
        ? await repos.fines.update({ ...existing, kind: rule.kind, value: rule.value }, actor.name)
        : await repos.fines.insert(rule, actor.name);

      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'fine_rule.save',
        subjectType: 'fine_rule',
        subjectId: saved.id,
        before,
        after: {
          scope: saved.scope,
          scopeId: saved.scopeId,
          unitKind: saved.unitKind,
          kind: saved.kind,
          value: saved.value,
        },
      });
      if (saved.scope === 'default') {
        await repos.outbox.add(fineRateChanged(actor.tenantId, saved, this.clock.now()));
      } else {
        await repriceScope({
          repos,
          tenantId: actor.tenantId,
          filter: filterFor(saved),
          clock: this.clock,
        });
      }
      const currency = (await repos.tenantRefs.get(actor.tenantId))?.currency ?? null;
      return {
        rule: saved,
        currency,
        scopeName: await repos.fines.scopeName(actor.tenantId, saved),
        allowedActions: ruleActions(saved, actor),
      };
    });
  }
}
