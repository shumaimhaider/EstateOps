import express from 'express';
import { actorFrom, requirePermission } from '@estateops/platform';
import { PERMISSION } from '@estateops/kernel';
import { toMatrixResponse, toRoleResponse, updateRoleRequest } from './permission.dto.js';

export function createPermissionRoutes({ listRolePermissions, updateRolePermissions }) {
  const router = express.Router();
  router.use('/permissions', requirePermission(PERMISSION.PERMISSIONS_MANAGE));
  router.get('/permissions', async (req, res) => {
    res.json(toMatrixResponse(await listRolePermissions.execute({ actor: actorFrom(req) })));
  });
  router.put('/permissions/:role', async (req, res) => {
    const { permissions } = updateRoleRequest.parse(req.body);
    res.json(
      toRoleResponse(
        await updateRolePermissions.execute({
          actor: actorFrom(req),
          role: req.params.role,
          permissions,
        }),
      ),
    );
  });
  return router;
}
