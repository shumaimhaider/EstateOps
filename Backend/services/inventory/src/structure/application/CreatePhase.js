import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { createPhase } from '../domain/structure.js';

export class CreatePhase {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, projectId, name }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const phase = createPhase({ tenantId: actor.tenantId, projectId, name });
    return this.uow.run(async (repos) => {
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      if (await repos.structure.phaseNameTaken(projectId, phase.name)) {
        throw new ConflictError(
          'PHASE_NAME_TAKEN',
          'This project already has a phase with that name',
        );
      }
      await repos.structure.insertPhase(phase);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'phase.create',
        subjectType: 'phase',
        subjectId: phase.id,
        after: { name: phase.name, projectId },
      });
      return phase;
    });
  }
}
