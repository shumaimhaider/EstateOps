/**
 * DTO <-> domain model for units. The only code (with unit.dto.js) that reads
 * backend field names. Model typedefs live in features/inventory/domain/unit.model.js.
 *
 * @typedef {import('../../../features/inventory/domain/unit.model.js').Unit} Unit
 * @typedef {import('../../../features/inventory/domain/unit.model.js').UnitDraft} UnitDraft
 * @typedef {import('../../../features/inventory/domain/unit.model.js').UnitFilters} UnitFilters
 */

// Model field -> wire field, shared by sorting and server field-error renaming.
const FIELD_TO_WIRE = {
  projectId: 'project_id',
  unitNo: 'unit_no',
  kind: 'kind',
  areaValue: 'area_value',
  areaUnit: 'area_unit',
  bedrooms: 'bedrooms',
  facing: 'facing',
  view: 'view',
  isCorner: 'corner',
  parkingSpaces: 'parking',
  listPrice: 'list_price',
  status: 'status',
};
const WIRE_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_WIRE).map(([k, v]) => [v, k]));

/** @param {import('./unit.dto.js').UnitDto} dto @returns {Unit} */
export function fromApi(dto) {
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    projectId: dto.project_id,
    projectName: dto.project_name,
    phaseId: dto.phase_id,
    blockId: dto.block_id,
    blockName: dto.block_name,
    floorId: dto.floor_id,
    floorLabel: dto.floor_label,
    unitNo: dto.unit_no,
    kind: dto.kind,
    area: { value: dto.area_value, unit: dto.area_unit },
    bedrooms: dto.bedrooms,
    facing: dto.facing,
    view: dto.view,
    isCorner: dto.corner,
    parkingSpaces: dto.parking,
    attributes: dto.attributes,
    status: dto.status,
    listPrice: { minor: dto.list_price, currency: dto.currency },
    geometry: dto.geometry,
    allowedActions: dto.allowed_actions,
    bookingId: dto.booking_id,
    media: dto.media ?? [],
    statusHistory: (dto.status_history ?? []).map((h) => ({
      status: h.status,
      changedBy: h.changed_by,
      changedByName: h.changed_by_name,
      changedAt: h.changed_at,
    })),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    createdBy: dto.created_by,
  };
}

export const fromApiList = (dtos) => dtos.map(fromApi);

/** Builds the POST body from a draft (form values already parsed into model terms). */
export function toApi(/** @type {UnitDraft} */ draft) {
  return {
    project_id: draft.projectId,
    unit_no: draft.unitNo,
    kind: draft.kind,
    area_value: draft.area.value,
    area_unit: draft.area.unit,
    bedrooms: draft.bedrooms,
    facing: draft.facing,
    view: draft.view,
    corner: draft.isCorner,
    parking: draft.parkingSpaces,
    list_price: draft.listPrice.minor,
    currency: draft.listPrice.currency,
  };
}

/** Model filters -> wire query params / GraphQL variables. */
export function filtersToApi(/** @type {UnitFilters} */ filters) {
  const sort = filters.sort
    ? `${FIELD_TO_WIRE[filters.sort.field]}:${filters.sort.dir}`
    : undefined;
  return {
    q: filters.search || undefined,
    status: filters.status || undefined,
    kind: filters.kind || undefined,
    project_id: filters.projectId || undefined,
    sort,
  };
}

/** Server field errors (wire names) -> form field names. */
export function fieldErrorsFromApi(fieldErrors) {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [
      WIRE_TO_FIELD[wire] ?? wire,
      message,
    ]),
  );
}
