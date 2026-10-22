import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class DeleteFloor {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const floor = await repos.structure.findFloor(actor.tenantId, id);
      if (!floor) throw new NotFoundError('Floor not found');
      if (await repos.structure.floorInUse(actor.tenantId, id)) {
        throw new ConflictError('FLOOR_IN_USE', 'Remove the units on this floor first');
      }
      await repos.structure.deleteFloor(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'floor.delete',
        subjectType: 'floor',
        subjectId: id,
        before: { number: floor.number },
      });
    });
  }
}
