import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { markReady } from '../../files/domain/fileAsset.js';
import { pendingUpload } from '../../files/application/uploads.js';
import { createMedia } from '../domain/unit.js';

/** Step 2: the file is in storage; check it and attach it to the unit. */
export class AddUnitMedia {
  constructor({ uow, files }) {
    this.uow = uow;
    this.files = files;
  }

  async execute({ actor, unitId, kind, assetId, caption }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const unit = await repos.units.findById(actor.tenantId, unitId);
      if (!unit) throw new NotFoundError('Unit not found');
      const owner = { type: 'unit', id: unitId };
      const pending = await pendingUpload({
        repos,
        actor,
        assetId,
        owner,
        purposes: [kind === 'floor_plan' ? 'floor_plan' : 'unit_image'],
      });
      const sortOrder = (await repos.unitMedia.list(unitId)).length;
      const media = createMedia({
        tenantId: actor.tenantId,
        unit,
        kind,
        fileId: pending.id,
        caption: caption ?? null,
        sortOrder,
      });
      const ready = markReady(
        pending,
        await this.files.storage.head(this.files.objectKey(pending)),
      );
      await repos.fileAssets.setStatus(actor.tenantId, ready.id, ready.status);
      await repos.unitMedia.add(media);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.media_add',
        subjectType: 'unit',
        subjectId: unitId,
        after: { kind, fileId: ready.id, file: ready.originalName },
      });
      return { ...media, asset: ready };
    });
  }
}
