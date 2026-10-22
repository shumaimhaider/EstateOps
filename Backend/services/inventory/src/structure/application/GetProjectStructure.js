import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** Phases, blocks and floors of a project. */
export class GetProjectStructure {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, projectId }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    return this.uow.read(async (repos) => {
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      return {
        phases: await repos.structure.listPhases(actor.tenantId, projectId),
        blocks: await repos.structure.listBlocks(actor.tenantId, projectId),
        floors: await repos.structure.listFloorsOfProject(actor.tenantId, projectId),
      };
    });
  }
}
