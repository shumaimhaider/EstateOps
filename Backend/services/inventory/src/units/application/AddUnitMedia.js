import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { createMedia } from '../domain/unit.js';

export class AddUnitMedia {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, unitId, kind, url, caption }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const unit = await repos.units.findById(actor.tenantId, unitId);
      if (!unit) throw new NotFoundError('Unit not found');
      const sortOrder = (await repos.unitMedia.list(unitId)).length;
      const media = createMedia({
        tenantId: actor.tenantId,
        unit,
        kind,
        url,
        caption: caption ?? null,
        sortOrder,
      });
      await repos.unitMedia.add(media);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.media_add',
        subjectType: 'unit',
        subjectId: unitId,
        after: { kind, url },
      });
      return media;
    });
  }
}
