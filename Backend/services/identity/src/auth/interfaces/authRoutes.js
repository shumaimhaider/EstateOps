import express from 'express';
import { actorFrom } from '@estateops/platform';
import {
  loginRequest,
  logoutRequest,
  refreshRequest,
  toChallengeResponse,
  toSessionResponse,
  toSessionUserResponse,
  toTokensResponse,
  twoFactorRequest,
} from './auth.dto.js';

/** Sign-in routes. Login, 2FA, refresh and logout are public; /auth/me needs a session. */
export function createAuthRoutes({ login, verifyTwoFactor, refreshSession, logout, getMe }) {
  const open = express.Router();
  const authed = express.Router();

  open.post('/auth/login', async (req, res) => {
    const body = loginRequest.parse(req.body);
    res.json(toChallengeResponse(await login.execute({ ...body, ip: req.ip })));
  });
  open.post('/auth/2fa', async (req, res) => {
    const body = twoFactorRequest.parse(req.body);
    const session = await verifyTwoFactor.execute({
      mfaToken: body.mfa_token,
      code: body.code,
      ip: req.ip,
    });
    res.json(toSessionResponse(session));
  });
  open.post('/auth/refresh', async (req, res) => {
    const { refresh_token: refreshToken } = refreshRequest.parse(req.body);
    res.json(toTokensResponse(await refreshSession.execute({ refreshToken })));
  });
  open.post('/auth/logout', async (req, res) => {
    const { refresh_token: refreshToken } = logoutRequest.parse(req.body ?? {});
    await logout.execute({ refreshToken });
    res.json({ ok: true });
  });

  authed.get('/auth/me', async (req, res) => {
    const { user, tenant } = await getMe.execute({ actor: actorFrom(req) });
    res.json(toSessionUserResponse(user, tenant));
  });

  return { open, authed };
}
