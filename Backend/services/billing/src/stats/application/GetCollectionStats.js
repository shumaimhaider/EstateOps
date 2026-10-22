import { PERMISSION, assertCan, today as todayOf } from '@estateops/kernel';

/** Collection figures for all projects or one, summed from the same invoices the register lists. */
export class GetCollectionStats {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, projectId = null }) {
    assertCan(actor, PERMISSION.STATS_VIEW);
    const asOf = todayOf(this.clock);
    return this.uow.read(async (repos) => {
      const settings = await repos.settings.get(actor.tenantId);
      const tenant = await repos.tenantRefs.get(actor.tenantId);
      const figures = await repos.stats.collect(actor.tenantId, {
        projectId,
        asOf,
        escalationMissed: settings.escalationMissed,
      });
      return { currency: tenant?.currency ?? null, asOf, ...figures };
    });
  }
}
