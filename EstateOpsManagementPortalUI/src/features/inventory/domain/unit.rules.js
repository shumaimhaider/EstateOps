import { UNIT_ACTIONS } from './unit.constants.js';

/** Actions the server allows AND this UI can present. No transition rules live here. */
export function presentableActions(unit) {
  return unit.allowedActions.filter((a) => a in UNIT_ACTIONS);
}

/** Sentence-style location, e.g. "Block A · Floor 3". */
export function unitLocationLabel(unit) {
  return [unit.blockName, unit.floorLabel].filter(Boolean).join(' · ');
}
