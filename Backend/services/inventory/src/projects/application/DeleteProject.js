import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** A project can be deleted only while it is empty: no units, phases or blocks. */
export class DeleteProject {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const project = await repos.projects.findById(actor.tenantId, id);
      if (!project) throw new NotFoundError('Project not found');
      const used = await repos.projects.childCounts(actor.tenantId, id);
      if (used.units + used.phases + used.blocks > 0) {
        throw new ConflictError(
          'PROJECT_NOT_EMPTY',
          'Remove the project’s units, phases and blocks first',
        );
      }
      await repos.projects.delete(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'project.delete',
        subjectType: 'project',
        subjectId: id,
        before: { name: project.name },
      });
    });
  }
}
