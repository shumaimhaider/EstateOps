import { isNonEmptyString, newId, validator } from '@estateops/kernel';

export const AREA_UNITS = Object.freeze(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']);
const SLUG = /^[a-z][a-z0-9]{1,23}$/;

function check({ slug, name, currency, locale, timeZone, areaUnit }) {
  const v = validator('The tenant could not be saved');
  if (slug !== undefined)
    v.check(
      SLUG.test(slug),
      'slug',
      'Use 2 to 24 lowercase letters or digits, starting with a letter',
    );
  if (name !== undefined) v.check(isNonEmptyString(name, 120), 'name', 'Name is required');
  if (currency !== undefined)
    v.check(/^[A-Z]{3}$/.test(currency), 'currency', 'Use a 3 letter currency code');
  if (locale !== undefined) v.check(isNonEmptyString(locale, 20), 'locale', 'Locale is required');
  if (timeZone !== undefined)
    v.check(isNonEmptyString(timeZone, 60), 'time_zone', 'Time zone is required');
  if (areaUnit !== undefined)
    v.check(AREA_UNITS.includes(areaUnit), 'area_unit', 'Unknown area unit');
  v.done();
}

/** A tenant is one developer, with its own currency, locale, time zone and area unit. */
export function createTenant(input, { id = newId() } = {}) {
  check(input);
  for (const key of ['slug', 'name', 'currency', 'locale', 'timeZone', 'areaUnit']) {
    if (input[key] === undefined) check({ [key]: '' });
  }
  return {
    id,
    slug: input.slug,
    name: input.name.trim(),
    currency: input.currency,
    locale: input.locale,
    timeZone: input.timeZone,
    areaUnit: input.areaUnit,
    version: 1,
  };
}

/** The currency and slug are fixed for life: money already booked depends on them. */
export function updateTenant(tenant, patch) {
  check({
    name: patch.name,
    locale: patch.locale,
    timeZone: patch.timeZone,
    areaUnit: patch.areaUnit,
  });
  return {
    ...tenant,
    name: patch.name !== undefined ? patch.name.trim() : tenant.name,
    locale: patch.locale ?? tenant.locale,
    timeZone: patch.timeZone ?? tenant.timeZone,
    areaUnit: patch.areaUnit ?? tenant.areaUnit,
  };
}
