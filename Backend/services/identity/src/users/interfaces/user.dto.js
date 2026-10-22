import { z } from 'zod';

export const createUserRequest = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateUserRequest = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.string().min(1).optional(),
    active: z.boolean().optional(),
    password: z.string().min(1).optional(),
  })
  .strict();

export const listUsersQuery = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const toUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  created_at: user.createdAt ? new Date(user.createdAt).toISOString() : null,
});

/** Only the create response carries the authenticator secret, once. */
export const toCreatedUserResponse = ({ user, totpSecret }) => ({
  ...toUserResponse(user),
  totp_secret: totpSecret,
});
