import {
  ConflictError,
  InvalidTransitionError,
  defineMachine,
  isNonEmptyString,
  newId,
  to,
  validator,
} from '@estateops/kernel';

export const UNIT_KINDS = Object.freeze(['plot', 'flat', 'villa', 'shop']);
export const AREA_UNITS = Object.freeze(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']);
export const UNIT_STATUSES = Object.freeze(['available', 'held', 'booked', 'sold', 'blocked']);

/** Staff move a unit between available, held and blocked. Booked and sold come from sales. */
export const unitMachine = defineMachine('unit', {
  available: { hold: to('held'), block: to('blocked'), book: to('booked', true) },
  held: { release: to('available'), expire: to('available', true), book: to('booked', true) },
  booked: { sell: to('sold', true), cancel_release: to('available', true) },
  sold: {},
  blocked: { unblock: to('available') },
});

const isIntOrNull = (n, min = 0) =>
  n === null || n === undefined || (Number.isInteger(n) && n >= min);
const isTextOrNull = (s, max = 60) =>
  s === null || s === undefined || (typeof s === 'string' && s.length <= max);

function check(f, { requireAll }, tenantCurrency) {
  const v = validator('The unit could not be saved');
  const has = (key) => f[key] !== undefined;
  if (requireAll || has('unitNo'))
    v.check(isNonEmptyString(f.unitNo ?? '', 40), 'unit_no', 'Unit number is required');
  if (requireAll || has('kind')) v.check(UNIT_KINDS.includes(f.kind), 'kind', 'Unknown unit kind');
  if (requireAll || has('areaValue'))
    v.check(
      typeof f.areaValue === 'number' && f.areaValue > 0 && f.areaValue < 1e9,
      'area_value',
      'Area must be greater than zero',
    );
  if (requireAll || has('areaUnit'))
    v.check(AREA_UNITS.includes(f.areaUnit), 'area_unit', 'Unknown area unit');
  if (has('bedrooms'))
    v.check(isIntOrNull(f.bedrooms), 'bedrooms', 'Bedrooms must be a whole number');
  if (has('facing')) v.check(isTextOrNull(f.facing), 'facing', 'Facing is too long');
  if (has('view')) v.check(isTextOrNull(f.view), 'view', 'View is too long');
  if (has('corner'))
    v.check(typeof f.corner === 'boolean', 'corner', 'Corner must be true or false');
  if (has('parking'))
    v.check(
      isIntOrNull(f.parking) && f.parking !== null,
      'parking',
      'Parking must be a whole number',
    );
  if (requireAll || has('listPrice')) {
    v.check(
      Number.isSafeInteger(f.listPrice) && f.listPrice >= 0,
      'list_price',
      'Price must be a non-negative whole number of minor units',
    );
  }
  if (requireAll || has('currency'))
    v.check(f.currency === tenantCurrency, 'list_price', `Price must be in ${tenantCurrency}`);
  v.done();
}

/** New units start available and unbooked. `fields` are camelCase (unitNo, areaValue, listPrice...); errors name fields as the API does. */
export function createUnit(
  { tenantId, projectId, fields, tenantCurrency, placement = {}, createdBy = null },
  { id = newId() } = {},
) {
  check(fields, { requireAll: true }, tenantCurrency);
  return {
    id,
    tenantId,
    projectId,
    phaseId: placement.phaseId ?? null,
    blockId: placement.blockId ?? null,
    floorId: placement.floorId ?? null,
    unitNo: fields.unitNo.trim(),
    kind: fields.kind,
    areaValue: fields.areaValue,
    areaUnit: fields.areaUnit,
    bedrooms: fields.bedrooms ?? null,
    facing: fields.facing ?? null,
    view: fields.view ?? null,
    corner: fields.corner ?? false,
    parking: fields.parking ?? 0,
    attributes: {},
    status: 'available',
    listPrice: fields.listPrice,
    currency: fields.currency,
    geometry: null,
    bookingId: null,
    everBooked: false,
    createdBy,
    version: 1,
  };
}

/** A booked or sold unit is part of a sale already agreed, so its facts are frozen. */
export function updateUnit(unit, fields, tenantCurrency) {
  if (unit.status === 'booked' || unit.status === 'sold') {
    throw new ConflictError('UNIT_LOCKED', 'A booked or sold unit cannot be edited');
  }
  check(fields, { requireAll: false }, tenantCurrency);
  return {
    ...unit,
    unitNo: fields.unitNo !== undefined ? fields.unitNo.trim() : unit.unitNo,
    kind: fields.kind ?? unit.kind,
    areaValue: fields.areaValue ?? unit.areaValue,
    areaUnit: fields.areaUnit ?? unit.areaUnit,
    bedrooms: fields.bedrooms !== undefined ? fields.bedrooms : unit.bedrooms,
    facing: fields.facing !== undefined ? fields.facing : unit.facing,
    view: fields.view !== undefined ? fields.view : unit.view,
    corner: fields.corner ?? unit.corner,
    parking: fields.parking ?? unit.parking,
    listPrice: fields.listPrice ?? unit.listPrice,
  };
}

/** Actions staff may take right now (hold, release, block, unblock). */
export const staffActions = (unit) => unitMachine.staffActions(unit.status);

export function applyStaffAction(unit, action) {
  if (!staffActions(unit).includes(action)) {
    throw new InvalidTransitionError(`Cannot ${action} a unit that is ${unit.status}`);
  }
  return { ...unit, status: unitMachine.transition(unit.status, action) };
}

/** Sales reserved the unit for a booking (from available or held). */
export function bookUnit(unit, bookingId) {
  return {
    ...unit,
    status: unitMachine.transition(unit.status, 'book'),
    bookingId,
    everBooked: true,
  };
}

/** The booking was cancelled: the unit is for sale again. */
export function releaseUnit(unit, bookingId) {
  if (unit.bookingId !== bookingId)
    throw new InvalidTransitionError('This unit belongs to another booking');
  return {
    ...unit,
    status: unitMachine.transition(unit.status, 'cancel_release'),
    bookingId: null,
  };
}

/** The booking is fully paid: the unit is sold. */
export function sellUnit(unit, bookingId) {
  if (unit.bookingId !== bookingId)
    throw new InvalidTransitionError('This unit belongs to another booking');
  return { ...unit, status: unitMachine.transition(unit.status, 'sell') };
}

/** Pictures exist for flats, shops and villas, never plots. */
export function createMedia(
  { tenantId, unit, kind, url, caption = null, sortOrder = 0 },
  { id = newId() } = {},
) {
  if (unit.kind === 'plot')
    throw new ConflictError('NO_MEDIA_ON_PLOTS', 'Pictures are not kept for plots');
  const v = validator('The picture could not be saved');
  v.check(['image', 'floor_plan'].includes(kind), 'kind', 'Choose image or floor plan');
  v.check(
    isNonEmptyString(url ?? '', 500) && /^https?:\/\//i.test(url),
    'url',
    'Enter a web address starting with http',
  );
  v.check(
    caption === null || (typeof caption === 'string' && caption.length <= 120),
    'caption',
    'Caption is too long',
  );
  v.done();
  return { id, tenantId, unitId: unit.id, kind, url, caption, sortOrder };
}
