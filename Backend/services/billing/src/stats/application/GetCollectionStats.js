import { PERMISSION, assertCan, noCache, today as todayOf } from '@estateops/kernel';

/** Collection figures for all projects or one, summed from the same invoices the register lists. */
export class GetCollectionStats {
  /** The figures are summed over every invoice, so they are cached briefly and refreshed when billing's money summaries change. */
  constructor({ uow, clock, cache = noCache }) {
    Object.assign(this, { uow, clock, cache });
  }

  async execute({ actor, projectId = null }) {
    assertCan(actor, PERMISSION.STATS_VIEW);
    const asOf = todayOf(this.clock);
    return this.cache.remember(
      {
        ns: 'stats',
        tenantId: actor.tenantId,
        key: `${projectId ?? 'all'}:${asOf}`,
        ttlMs: 30_000,
      },
      () => this.#collect(actor, projectId, asOf),
    );
  }

  #collect(actor, projectId, asOf) {
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
