import { z } from 'zod';

export const tenantDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  locale: z.string(),
  time_zone: z.string(),
  area_unit: z.string(),
});

export const customerDtoSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  name: z.string(),
  email: z.string(),
  tenant: tenantDtoSchema,
});

export const sessionDtoSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  customer: customerDtoSchema,
});

export const tokensDtoSchema = z.object({ access_token: z.string(), refresh_token: z.string() });

export const setPasswordDtoSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  email: z.string(),
});

export const profileDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  preferred_language: z.string(),
  id_number_masked: z.string(),
  currency: z.string().nullable(),
});
