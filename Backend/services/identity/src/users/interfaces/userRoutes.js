import express from 'express';
import { actorFrom, pageResponse, requirePermission } from '@estateops/platform';
import { PERMISSION } from '@estateops/kernel';
import {
  createUserRequest,
  listUsersQuery,
  toCreatedUserResponse,
  toUserResponse,
  updateUserRequest,
} from './user.dto.js';

export function createUserRoutes({ createUser, listUsers, getUser, updateUser, deactivateUser }) {
  const router = express.Router();
  router.use('/users', requirePermission(PERMISSION.PERMISSIONS_MANAGE));

  router.get('/users', async (req, res) => {
    const query = listUsersQuery.parse(req.query);
    res.json(
      pageResponse(await listUsers.execute({ actor: actorFrom(req), ...query }), toUserResponse),
    );
  });
  router.post('/users', async (req, res) => {
    const body = createUserRequest.parse(req.body);
    res
      .status(201)
      .json(toCreatedUserResponse(await createUser.execute({ actor: actorFrom(req), ...body })));
  });
  router.get('/users/:id', async (req, res) => {
    res.json(toUserResponse(await getUser.execute({ actor: actorFrom(req), id: req.params.id })));
  });
  router.patch('/users/:id', async (req, res) => {
    const patch = updateUserRequest.parse(req.body);
    res.json(
      toUserResponse(await updateUser.execute({ actor: actorFrom(req), id: req.params.id, patch })),
    );
  });
  router.delete('/users/:id', async (req, res) => {
    await deactivateUser.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  return router;
}
