import { z } from 'zod';

/** GET /permissions: every permission the portal knows, and what each role currently holds. */
export const rolePermissionDtoSchema = z.object({
  role: z.string(),
  permissions: z.array(z.string()),
  locked: z.boolean(),
});

export const permissionMatrixDtoSchema = z.object({
  catalog: z.array(z.object({ key: z.string(), group: z.string() })),
  roles: z.array(rolePermissionDtoSchema),
});

/** Request body for PUT /permissions/{role}. */
export const rolePermissionWriteDtoSchema = z.object({ permissions: z.array(z.string()) });
