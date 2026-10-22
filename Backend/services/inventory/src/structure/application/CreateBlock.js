import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { createBlock } from '../domain/structure.js';

export class CreateBlock {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, projectId, phaseId, name, kind }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const block = createBlock({
      tenantId: actor.tenantId,
      projectId,
      phaseId: phaseId ?? null,
      name,
      kind,
    });
    return this.uow.run(async (repos) => {
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      if (block.phaseId) {
        const phase = await repos.structure.findPhase(actor.tenantId, block.phaseId);
        if (!phase || phase.projectId !== projectId)
          throw new NotFoundError('Phase not found in this project');
      }
      if (await repos.structure.blockNameTaken(projectId, block.name)) {
        throw new ConflictError(
          'BLOCK_NAME_TAKEN',
          'This project already has a block with that name',
        );
      }
      await repos.structure.insertBlock(block);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'block.create',
        subjectType: 'block',
        subjectId: block.id,
        after: { name: block.name, kind: block.kind, projectId },
      });
      return block;
    });
  }
}
