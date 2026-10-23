import express from 'express';
import { actorFrom, customerFrom } from '@estateops/platform';
import {
  changePasswordRequest,
  forgotRequest,
  logoutRequest,
  portalLoginRequest,
  refreshRequest,
  setPasswordRequest,
  toCustomerResponse,
  toPortalAccessResponse,
  toPortalSessionResponse,
} from './portal.dto.js';
import { toTokensResponse } from '../../auth/interfaces/auth.dto.js';

/** Sign-in and password routes of the customer portal. Everything but /auth/me and change-password is open. */
export function createPortalAuthRoutes(uc) {
  const open = express.Router();
  const authed = express.Router();

  open.post('/auth/login', async (req, res) => {
    const body = portalLoginRequest.parse(req.body);
    res.json(
      toPortalSessionResponse(
        await uc.login.execute({
          tenantSlug: body.tenant,
          email: body.email,
          password: body.password,
          ip: req.ip,
        }),
      ),
    );
  });
  open.post('/auth/refresh', async (req, res) => {
    const { refresh_token: refreshToken } = refreshRequest.parse(req.body);
    res.json(toTokensResponse(await uc.refresh.execute({ refreshToken })));
  });
  open.post('/auth/logout', async (req, res) => {
    await uc.logout.execute({ refreshToken: logoutRequest.parse(req.body ?? {}).refresh_token });
    res.json({ ok: true });
  });
  // the same answer for every address, so this cannot be used to find out who is a customer
  open.post('/auth/forgot-password', async (req, res) => {
    const body = forgotRequest.parse(req.body);
    await uc.forgotPassword.execute({ tenantSlug: body.tenant, email: body.email, ip: req.ip });
    res.status(202).json({ accepted: true });
  });
  open.post('/auth/set-password', async (req, res) => {
    const body = setPasswordRequest.parse(req.body);
    const done = await uc.setPassword.execute({
      token: body.token,
      password: body.password,
      ip: req.ip,
    });
    res.json({ ok: true, tenant: done.tenantSlug, email: done.email });
  });

  authed.get('/auth/me', async (req, res) => {
    const { account, tenant } = await uc.getMe.execute({ customer: customerFrom(req) });
    res.json(toCustomerResponse(account, tenant));
  });
  authed.post('/auth/change-password', async (req, res) => {
    const body = changePasswordRequest.parse(req.body);
    res.json(
      await uc.changePassword.execute({
        customer: customerFrom(req),
        currentPassword: body.current_password,
        newPassword: body.new_password,
        ip: req.ip,
      }),
    );
  });
  return { open, authed };
}

/** Staff side: see, send and switch a customer's portal access. */
export function createPortalAccessRoutes(uc) {
  const router = express.Router();
  router.get('/customers/:id/portal-access', async (req, res) => {
    const access = await uc.getPortalAccess.execute({
      actor: actorFrom(req),
      customerId: req.params.id,
    });
    res.json(
      access ? toPortalAccessResponse(access) : { status: 'none', customer_id: req.params.id },
    );
  });
  router.post('/customers/:id/portal-access/send-link', async (req, res) => {
    const sent = await uc.sendAccessLink.execute({
      actor: actorFrom(req),
      customerId: req.params.id,
    });
    res.status(202).json({ purpose: sent.purpose, ...toPortalAccessResponse(sent) });
  });
  for (const [action, enabled] of [
    ['enable', true],
    ['disable', false],
  ]) {
    router.post(`/customers/:id/portal-access/${action}`, async (req, res) => {
      res.json(
        toPortalAccessResponse(
          await uc.setPortalAccess.execute({
            actor: actorFrom(req),
            customerId: req.params.id,
            enabled,
          }),
        ),
      );
    });
  }
  return router;
}
