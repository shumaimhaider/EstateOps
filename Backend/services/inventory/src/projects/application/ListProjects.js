import { PERMISSION, assertCan, can } from '@estateops/kernel';

export class ListProjects {
  constructor({ uow }) {
    this.uow = uow;
  }

  /** input: { actor, cursor, limit } -> { items: [{ project, unitCounts, unitsTotal }], nextCursor } */
  async execute({ actor, cursor, limit }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    const page = await this.uow.read((repos) =>
      repos.projects.list(actor.tenantId, { cursor, limit }),
    );
    const allowedActions = can(actor, PERMISSION.INVENTORY_MANAGE) ? ['update', 'delete'] : [];
    return { ...page, items: page.items.map((item) => ({ ...item, allowedActions })) };
  }
}
