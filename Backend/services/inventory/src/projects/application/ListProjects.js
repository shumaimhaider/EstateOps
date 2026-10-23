import { PERMISSION, assertCan, can, noCache } from '@estateops/kernel';

export class ListProjects {
  /** Every dashboard visit lists projects with live unit counts, so a page is cached briefly (and dropped when units change). */
  constructor({ uow, cache = noCache }) {
    Object.assign(this, { uow, cache });
  }

  /** input: { actor, cursor, limit } -> { items: [{ project, unitCounts, unitsTotal }], nextCursor } */
  async execute({ actor, cursor, limit }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    const page = await this.cache.remember(
      {
        ns: 'projects',
        tenantId: actor.tenantId,
        key: `list:${cursor ?? ''}:${limit ?? ''}`,
        ttlMs: 20_000,
      },
      () => this.uow.read((repos) => repos.projects.list(actor.tenantId, { cursor, limit })),
    );
    const allowedActions = can(actor, PERMISSION.INVENTORY_MANAGE) ? ['update', 'delete'] : [];
    return { ...page, items: page.items.map((item) => ({ ...item, allowedActions })) };
  }
}
