import { z } from 'zod';

/** Wire shapes for sign-in. Tokens are opaque strings; the user carries its tenant presentation settings. */
export const userDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
  tenant: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    currency: z.string().length(3),
    locale: z.string(),
    time_zone: z.string(),
    area_unit: z.enum(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']),
  }),
});

export const sessionDtoSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: userDtoSchema,
});

export const mfaChallengeDtoSchema = z.object({
  status: z.literal('mfa_required'),
  mfa_token: z.string(),
});

export const tokensDtoSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
});

export const logoutDtoSchema = z.object({ ok: z.boolean() });

/** Mock-mode only: seeded accounts offered on the login page and in the Google chooser. */
export const devAccountDtoSchema = z.object({
  email: z.string(),
  name: z.string(),
  role: z.string(),
  tenant_name: z.string(),
});
