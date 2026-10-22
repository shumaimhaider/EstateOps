import { NotFoundError, PERMISSION, assertCan, can } from '@estateops/kernel';

export class GetProject {
  constructor({ uow }) {
    this.uow = uow;
  }

  /** -> { project, unitCounts, unitsTotal } */
  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    return this.uow.read(async (repos) => {
      const found = await repos.projects.findWithCounts(actor.tenantId, id);
      if (!found) throw new NotFoundError('Project not found');
      return {
        ...found,
        allowedActions: can(actor, PERMISSION.INVENTORY_MANAGE) ? ['update', 'delete'] : [],
      };
    });
  }
}
