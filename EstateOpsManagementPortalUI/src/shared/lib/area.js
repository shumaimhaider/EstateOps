/** Area units supported by the product and their size in square feet. */
export const AREA_UNITS = Object.freeze({
  marla: 272.25,
  kanal: 5445,
  sq_ft: 1,
  sq_yd: 9,
  sq_m: 10.7639,
});

export const AREA_UNIT_KEYS = Object.keys(AREA_UNITS);

/** Convert for display only (e.g. show a marla plot in the tenant's sq ft preference). */
export function convertArea(value, from, to) {
  if (from === to) return value;
  return (value * AREA_UNITS[from]) / AREA_UNITS[to];
}

export function formatArea(value, locale = 'en') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
