import { ForbiddenError, UnauthenticatedError } from '@estateops/kernel';

/** Reads the bearer token, verifies it and puts the signed-in person on `req.auth`. */
export const authenticate = (verifier) => async (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new UnauthenticatedError();
  req.auth = await verifier.verify(match[1]);
  next();
};

/** Refuses the request unless the person holds every listed permission. */
export const requirePermission =
  (...keys) =>
  (req, _res, next) => {
    if (!keys.every((key) => req.auth?.permissions.includes(key))) throw new ForbiddenError();
    next();
  };

/** Refuses the request unless the person holds at least one of the listed permissions. */
export const requireAnyPermission =
  (...keys) =>
  (req, _res, next) => {
    if (!keys.some((key) => req.auth?.permissions.includes(key))) throw new ForbiddenError();
    next();
  };

/** The signed-in person as plain data for use cases. Tenant always comes from the token. */
export const actorFrom = (req) => ({
  tenantId: req.auth.tenantId,
  userId: req.auth.userId,
  name: req.auth.name,
  role: req.auth.role,
  permissions: req.auth.permissions,
});
