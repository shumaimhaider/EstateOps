import { z } from 'zod';
import { toIso } from '@estateops/kernel';
import { toTenantResponse } from '../../auth/interfaces/auth.dto.js';

export const portalLoginRequest = z.object({
  tenant: z.string().trim().min(1, 'Choose your developer'),
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});
export const forgotRequest = z.object({
  tenant: z.string().trim().min(1, 'Choose your developer'),
  email: z.string().trim().min(1, 'Enter your email'),
});
export const setPasswordRequest = z.object({
  token: z.string().min(1, 'The link is incomplete'),
  password: z.string().min(1, 'Choose a password'),
});
export const changePasswordRequest = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: z.string().min(1, 'Choose a new password'),
});
export const refreshRequest = z.object({ refresh_token: z.string().min(1) });
export const logoutRequest = z.object({ refresh_token: z.string().optional() });

export const toCustomerResponse = (account, tenant) => ({
  id: account.customerId,
  account_id: account.id,
  name: account.fullName,
  email: account.email,
  tenant: toTenantResponse(tenant),
});

export const toPortalSessionResponse = ({ accessToken, refreshToken, account, tenant }) => ({
  access_token: accessToken,
  refresh_token: refreshToken,
  customer: toCustomerResponse(account, tenant),
});

/** What staff see about a customer's portal account. Never the password or any link. */
export const toPortalAccessResponse = (a) =>
  a && {
    customer_id: a.customerId,
    email: a.email,
    status: a.status,
    has_password: a.hasPassword,
    invited_at: a.invitedAt ? toIso(a.invitedAt) : null,
    last_login_at: a.lastLoginAt ? toIso(a.lastLoginAt) : null,
  };
