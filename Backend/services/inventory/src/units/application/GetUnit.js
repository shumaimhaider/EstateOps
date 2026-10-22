import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { allowedActionsFor } from './allowedActions.js';

/** One unit with its status history and pictures. */
export class GetUnit {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.UNITS_VIEW);
    return this.uow.read(async (repos) => {
      const view = await repos.units.findDetail(actor.tenantId, id);
      if (!view) throw new NotFoundError('Unit not found');
      return {
        ...view,
        history: await repos.unitHistory.list(id),
        media: await repos.unitMedia.list(id),
        allowedActions: allowedActionsFor(view.unit, actor),
      };
    });
  }
}
