import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class RemoveUnitMedia {
  constructor({ uow, files }) {
    this.uow = uow;
    this.files = files;
  }

  async execute({ actor, unitId, mediaId }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const asset = await this.uow.run(async (repos) => {
      const removed = await repos.unitMedia.remove(actor.tenantId, unitId, mediaId);
      if (!removed) throw new NotFoundError('Picture not found');
      const file = removed.fileId
        ? await repos.fileAssets.findById(actor.tenantId, removed.fileId)
        : null;
      if (file) await repos.fileAssets.setStatus(actor.tenantId, file.id, 'deleted');
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.media_remove',
        subjectType: 'unit',
        subjectId: unitId,
        before: { mediaId, file: file?.originalName ?? null },
      });
      return file;
    });
    // Best effort after the commit: a failure leaves an orphan the clean-up job removes.
    if (asset) await this.files.storage.remove(this.files.objectKey(asset)).catch(() => {});
  }
}
