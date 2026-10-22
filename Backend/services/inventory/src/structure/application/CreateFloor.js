import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { createFloor } from '../domain/structure.js';

export class CreateFloor {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, blockId, number, label }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const floor = createFloor({ tenantId: actor.tenantId, blockId, number, label });
    return this.uow.run(async (repos) => {
      const block = await repos.structure.findBlock(actor.tenantId, blockId);
      if (!block) throw new NotFoundError('Block not found');
      if (block.kind !== 'building')
        throw new ConflictError('NOT_A_BUILDING', 'Only a building has floors');
      if (await repos.structure.floorNumberTaken(blockId, number)) {
        throw new ConflictError('FLOOR_NUMBER_TAKEN', 'This block already has that floor');
      }
      await repos.structure.insertFloor(floor);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'floor.create',
        subjectType: 'floor',
        subjectId: floor.id,
        after: { blockId, number },
      });
      return floor;
    });
  }
}
