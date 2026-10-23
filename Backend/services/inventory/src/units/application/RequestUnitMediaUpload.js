import { ConflictError, NotFoundError, PERMISSION, assertCan, fieldError } from '@estateops/kernel';
import { issueUpload } from '../../files/application/uploads.js';

const PURPOSE = { image: 'unit_image', floor_plan: 'floor_plan' };

/** Step 1 of adding a picture: a signed URL the browser uploads the file to. */
export class RequestUnitMediaUpload {
  constructor({ uow, files }) {
    this.uow = uow;
    this.files = files;
  }

  async execute({ actor, unitId, kind, filename, contentType, size }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    if (!PURPOSE[kind]) throw fieldError('kind', 'Choose image or floor plan');
    return this.uow.run(async (repos) => {
      const unit = await repos.units.findById(actor.tenantId, unitId);
      if (!unit) throw new NotFoundError('Unit not found');
      if (unit.kind === 'plot')
        throw new ConflictError('NO_MEDIA_ON_PLOTS', 'Pictures are not kept for plots');
      return issueUpload({
        files: this.files,
        repos,
        actor,
        owner: { type: 'unit', id: unitId },
        purpose: PURPOSE[kind],
        filename,
        contentType,
        size,
      });
    });
  }
}
