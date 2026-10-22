import { z } from 'zod';

export const updateRoleRequest = z.object({ permissions: z.array(z.string()) });

export const toRoleResponse = ({ role, permissions, locked }) => ({ role, permissions, locked });

export const toMatrixResponse = ({ catalog, roles }) => ({
  catalog: catalog.map(({ key, group }) => ({ key, group })),
  roles: roles.map(toRoleResponse),
});
