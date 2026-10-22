import { PERMISSION, assertCan } from '@estateops/kernel';
import { allowedActionsFor } from './allowedActions.js';

export const UNIT_SORT_FIELDS = Object.freeze(['unit_no', 'area_value', 'list_price', 'status']);

/**
 * input: { actor, q, status, kind, projectId, sort, cursor, limit }
 * -> { items: [{ unit, projectName, blockName, floorLabel, allowedActions }], nextCursor }
 */
export class ListUnits {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.UNITS_VIEW);
    const page = await this.uow.read((repos) => repos.units.list(actor.tenantId, filters));
    return {
      ...page,
      items: page.items.map((view) => ({
        ...view,
        allowedActions: allowedActionsFor(view.unit, actor),
      })),
    };
  }
}
