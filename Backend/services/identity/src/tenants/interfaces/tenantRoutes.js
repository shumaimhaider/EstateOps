import express from 'express';
import { UnauthenticatedError } from '@estateops/kernel';
import { actorFrom, safeEqual } from '@estateops/platform';
import {
  createTenantRequest,
  toCreateTenantInput,
  toCreatedTenantResponse,
  toTenantPatch,
  toTenantResponse,
  updateTenantRequest,
} from './tenant.dto.js';

/** GET and PATCH /tenant for the signed-in tenant. */
export function createTenantRoutes({ getTenant, updateTenant }) {
  const router = express.Router();
  router.get('/tenant', async (req, res) => {
    res.json(toTenantResponse(await getTenant.execute({ actor: actorFrom(req) })));
  });
  router.patch('/tenant', async (req, res) => {
    const patch = toTenantPatch(updateTenantRequest.parse(req.body));
    res.json(toTenantResponse(await updateTenant.execute({ actor: actorFrom(req), patch })));
  });
  return router;
}

/** POST /internal/tenants: bootstraps a tenant. Needs the internal token and the bootstrap token. */
export function createTenantBootstrapRoutes({ createTenant, bootstrapToken }) {
  const router = express.Router();
  router.post('/tenants', async (req, res) => {
    if (!bootstrapToken || !safeEqual(req.get('x-bootstrap-token') ?? '', bootstrapToken)) {
      throw new UnauthenticatedError(
        'INVALID_BOOTSTRAP_TOKEN',
        'Bootstrap token is missing or wrong',
      );
    }
    const body = createTenantRequest.parse(req.body);
    res
      .status(201)
      .json(toCreatedTenantResponse(await createTenant.execute(toCreateTenantInput(body))));
  });
  return router;
}
