import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { isRequiredDefault } from '../domain/rule.js';
import { fineRateChanged } from '../../installments/application/events.js';
import { filterFor, repriceScope } from './repriceScope.js';

/** Removes an override so its level inherits again. The all-category default can never be removed. */
export class DeleteFineRule {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.FINES_MANAGE);
    return this.uow.run(async (repos) => {
      const rule = await repos.fines.findById(actor.tenantId, id);
      if (!rule) throw new NotFoundError('Fine rate not found');
      if (isRequiredDefault(rule))
        throw new ConflictError('DEFAULT_RULE_REQUIRED', 'The default fine rate cannot be removed');
      await repos.fines.delete(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'fine_rule.delete',
        subjectType: 'fine_rule',
        subjectId: id,
        before: {
          scope: rule.scope,
          scopeId: rule.scopeId,
          unitKind: rule.unitKind,
          kind: rule.kind,
          value: rule.value,
        },
      });
      if (rule.scope === 'default')
        await repos.outbox.add(fineRateChanged(actor.tenantId, rule, this.clock.now()));
      else
        await repriceScope({
          repos,
          tenantId: actor.tenantId,
          filter: filterFor(rule),
          clock: this.clock,
        });
    });
  }
}
