import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updateBlock } from '../domain/structure.js';

export class UpdateBlock {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id, patch }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.structure.findBlock(actor.tenantId, id);
      if (!current) throw new NotFoundError('Block not found');
      const next = updateBlock(current, patch);
      if (
        next.name.toLowerCase() !== current.name.toLowerCase() &&
        (await repos.structure.blockNameTaken(current.projectId, next.name))
      ) {
        throw new ConflictError(
          'BLOCK_NAME_TAKEN',
          'This project already has a block with that name',
        );
      }
      if (next.phaseId && next.phaseId !== current.phaseId) {
        const phase = await repos.structure.findPhase(actor.tenantId, next.phaseId);
        if (!phase || phase.projectId !== current.projectId)
          throw new NotFoundError('Phase not found in this project');
      }
      const saved = await repos.structure.updateBlock(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'block.update',
        subjectType: 'block',
        subjectId: id,
        before: { name: current.name, kind: current.kind },
        after: { name: saved.name, kind: saved.kind },
      });
      return saved;
    });
  }
}
