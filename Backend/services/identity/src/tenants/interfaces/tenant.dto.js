import { z } from 'zod';
import { toTenantResponse } from '../../auth/interfaces/auth.dto.js';

export { toTenantResponse };

export const updateTenantRequest = z
  .object({
    name: z.string().trim().min(1).optional(),
    locale: z.string().trim().min(1).optional(),
    time_zone: z.string().trim().min(1).optional(),
    area_unit: z.string().optional(),
  })
  .strict();

export const toTenantPatch = (body) => ({
  name: body.name,
  locale: body.locale,
  timeZone: body.time_zone,
  areaUnit: body.area_unit,
});

export const createTenantRequest = z.object({
  slug: z.string(),
  name: z.string(),
  currency: z.string(),
  locale: z.string(),
  time_zone: z.string(),
  area_unit: z.string(),
  owner: z.object({ email: z.string(), name: z.string(), password: z.string() }),
});

export const toCreateTenantInput = (body) => ({
  slug: body.slug,
  name: body.name,
  currency: body.currency,
  locale: body.locale,
  timeZone: body.time_zone,
  areaUnit: body.area_unit,
  owner: body.owner,
});

export const toCreatedTenantResponse = ({ tenant, owner, totpSecret }) => ({
  tenant: toTenantResponse(tenant),
  owner: {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    totp_secret: totpSecret,
  },
});
