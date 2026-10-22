import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class DeleteBlock {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const block = await repos.structure.findBlock(actor.tenantId, id);
      if (!block) throw new NotFoundError('Block not found');
      if (await repos.structure.blockInUse(actor.tenantId, id)) {
        throw new ConflictError('BLOCK_IN_USE', 'Remove the floors and units of this block first');
      }
      await repos.structure.deleteBlock(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'block.delete',
        subjectType: 'block',
        subjectId: id,
        before: { name: block.name },
      });
    });
  }
}
