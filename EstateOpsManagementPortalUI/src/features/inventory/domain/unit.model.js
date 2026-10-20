import PropTypes from 'prop-types';

/**
 * Domain model for a unit as the UI sees it (camelCase, UI vocabulary). Hooks,
 * components and pages only ever receive this shape, never a DTO.
 *
 * @typedef {'available'|'held'|'booked'|'sold'|'blocked'} UnitStatus
 * @typedef {'plot'|'flat'|'villa'|'shop'} UnitKind
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{ value: number, unit: string }} AreaValue
 * @typedef {{ status: UnitStatus, changedBy: string|null, changedByName: string|null, changedAt: string }} StatusChange
 * @typedef {{
 *   id: string, tenantId: string, projectId: string, projectName: string,
 *   phaseId: string|null, blockId: string|null, blockName: string|null,
 *   floorId: string|null, floorLabel: string|null, unitNo: string, kind: UnitKind,
 *   area: AreaValue, bedrooms: number|null, facing: string|null, view: string|null,
 *   isCorner: boolean, parkingSpaces: number, attributes: Record<string, unknown>,
 *   status: UnitStatus, listPrice: Money, geometry: Record<string, unknown>|null,
 *   allowedActions: string[], bookingId: string|null,
 *   media: { id: string, kind: string, url: string, caption: string }[],
 *   statusHistory: StatusChange[],
 *   createdAt: string, updatedAt: string, createdBy: string|null
 * }} Unit
 * @typedef {{
 *   projectId: string, unitNo: string, kind: UnitKind, area: AreaValue,
 *   bedrooms: number|null, facing: string|null, view: string|null, isCorner: boolean,
 *   parkingSpaces: number, listPrice: Money
 * }} UnitDraft
 * @typedef {{
 *   search?: string, status?: UnitStatus|'', kind?: UnitKind|'', projectId?: string,
 *   sort?: { field: 'unitNo'|'areaValue'|'listPrice'|'status', dir: 'asc'|'desc' }
 * }} UnitFilters
 */

export const unitShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  projectName: PropTypes.string.isRequired,
  blockName: PropTypes.string,
  floorLabel: PropTypes.string,
  unitNo: PropTypes.string.isRequired,
  kind: PropTypes.string.isRequired,
  area: PropTypes.shape({ value: PropTypes.number, unit: PropTypes.string }).isRequired,
  bedrooms: PropTypes.number,
  status: PropTypes.string.isRequired,
  listPrice: PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string }).isRequired,
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});
