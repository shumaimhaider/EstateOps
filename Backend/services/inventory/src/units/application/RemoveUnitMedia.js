import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class RemoveUnitMedia {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, unitId, mediaId }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const removed = await repos.unitMedia.remove(actor.tenantId, unitId, mediaId);
      if (!removed) throw new NotFoundError('Picture not found');
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.media_remove',
        subjectType: 'unit',
        subjectId: unitId,
        before: { mediaId },
      });
    });
  }
}
