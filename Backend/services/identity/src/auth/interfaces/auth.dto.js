import { z } from 'zod';

/** Request and response shapes for sign-in. Responses list their fields explicitly. */
export const loginRequest = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});

export const twoFactorRequest = z.object({
  mfa_token: z.string().min(1),
  code: z.string().trim().min(1, 'Enter the 6-digit code'),
});

export const refreshRequest = z.object({ refresh_token: z.string().min(1) });
export const logoutRequest = z.object({ refresh_token: z.string().optional() });

export const toTenantResponse = (tenant) => ({
  id: tenant.id,
  slug: tenant.slug,
  name: tenant.name,
  currency: tenant.currency,
  locale: tenant.locale,
  time_zone: tenant.timeZone,
  area_unit: tenant.areaUnit,
});

export const toSessionUserResponse = (user, tenant) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: user.permissions,
  tenant: toTenantResponse(tenant),
});

export const toChallengeResponse = ({ mfaToken }) => ({
  status: 'mfa_required',
  mfa_token: mfaToken,
});

export const toSessionResponse = ({ accessToken, refreshToken, user, tenant }) => ({
  access_token: accessToken,
  refresh_token: refreshToken,
  user: toSessionUserResponse(user, tenant),
});

export const toTokensResponse = ({ accessToken, refreshToken }) => ({
  access_token: accessToken,
  refresh_token: refreshToken,
});
