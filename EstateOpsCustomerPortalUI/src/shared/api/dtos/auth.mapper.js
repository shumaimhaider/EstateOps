export const tenantFromApi = (t) => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  currency: t.currency,
  locale: t.locale,
  timeZone: t.time_zone,
  areaUnit: t.area_unit,
});

export const customerFromApi = (c) => ({
  id: c.id,
  accountId: c.account_id,
  name: c.name,
  email: c.email,
  tenant: tenantFromApi(c.tenant),
});

export const sessionFromApi = (dto) => ({
  accessToken: dto.access_token,
  refreshToken: dto.refresh_token,
  customer: customerFromApi(dto.customer),
});

export const profileFromApi = (p) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  phone: p.phone,
  city: p.city,
  preferredLanguage: p.preferred_language,
  idNumberMasked: p.id_number_masked,
  currency: p.currency,
});

export function fieldErrorsFromApi(fieldErrors) {
  const names = { new_password: 'newPassword', current_password: 'currentPassword' };
  return Object.fromEntries(Object.entries(fieldErrors ?? {}).map(([k, v]) => [names[k] ?? k, v]));
}
