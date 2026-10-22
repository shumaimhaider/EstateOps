import { PERMISSION, can } from '@estateops/kernel';
import { staffActions } from '../domain/unit.js';

/** `allowed_actions` for the UI: the unit's state decides what is possible, the role who may. */
export const allowedActionsFor = (unit, actor) =>
  can(actor, PERMISSION.INVENTORY_MANAGE) ? staffActions(unit) : [];
