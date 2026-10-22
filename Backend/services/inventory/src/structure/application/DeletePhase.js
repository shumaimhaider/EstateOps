import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class DeletePhase {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const phase = await repos.structure.findPhase(actor.tenantId, id);
      if (!phase) throw new NotFoundError('Phase not found');
      if (await repos.structure.phaseInUse(actor.tenantId, id)) {
        throw new ConflictError(
          'PHASE_IN_USE',
          'Move or remove the blocks and units of this phase first',
        );
      }
      await repos.structure.deletePhase(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'phase.delete',
        subjectType: 'phase',
        subjectId: id,
        before: { name: phase.name },
      });
    });
  }
}
