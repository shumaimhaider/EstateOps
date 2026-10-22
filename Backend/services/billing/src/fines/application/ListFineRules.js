import { PERMISSION, assertCan } from '@estateops/kernel';
import { ruleActions } from './rules.js';

/** Every configured rate: the default first, then each project, property and customer level. */
export class ListFineRules {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor }) {
    assertCan(actor, PERMISSION.FINES_VIEW);
    return this.uow.read(async (repos) => {
      const rules = await repos.fines.list(actor.tenantId);
      const currency = (await repos.tenantRefs.get(actor.tenantId))?.currency ?? null;
      const items = [];
      for (const rule of rules)
        items.push({
          rule,
          currency,
          scopeName: await repos.fines.scopeName(actor.tenantId, rule),
          allowedActions: ruleActions(rule, actor),
        });
      return { items, nextCursor: null };
    });
  }
}
