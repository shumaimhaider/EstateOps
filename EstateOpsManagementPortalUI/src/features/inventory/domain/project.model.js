import PropTypes from 'prop-types';

/**
 * @typedef {'plot_society'|'tower'|'mixed'} ProjectKind
 * @typedef {{ available: number, held: number, booked: number, sold: number, blocked: number }} UnitCounts
 * @typedef {{
 *   id: string, tenantId: string, name: string, location: string, kind: ProjectKind,
 *   unitsTotal: number, unitCounts: UnitCounts, allowedActions: string[],
 *   createdAt: string, updatedAt: string, createdBy: string|null
 * }} Project
 * @typedef {{ id: string, name: string, kind: string, x: number, y: number, w: number, h: number }} MapBlock
 * @typedef {{
 *   unitId: string, unitNo: string, blockId: string|null, kind: string, status: string,
 *   x: number, y: number, w: number, h: number
 * }} MapShape
 * @typedef {{ projectId: string, projectName: string, width: number, height: number, blocks: MapBlock[], shapes: MapShape[] }} ProjectMap
 */
export const projectShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  location: PropTypes.string,
  kind: PropTypes.string,
  unitsTotal: PropTypes.number,
  unitCounts: PropTypes.shape({
    available: PropTypes.number,
    held: PropTypes.number,
    booked: PropTypes.number,
    sold: PropTypes.number,
    blocked: PropTypes.number,
  }),
});

export const projectMapShape = PropTypes.shape({
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  blocks: PropTypes.arrayOf(PropTypes.object).isRequired,
  shapes: PropTypes.arrayOf(PropTypes.object).isRequired,
});
