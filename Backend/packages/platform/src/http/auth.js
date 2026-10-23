import { ForbiddenError, UnauthenticatedError } from '@estateops/kernel';

const bearer = async (req, verifier) => {
  const match = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
  if (!match) throw new UnauthenticatedError();
  return verifier.verify(match[1]);
};

/**
 * Staff API: reads the bearer token, verifies it and puts the signed-in person on `req.auth`.
 * A customer's token is refused here, so the portal can never reach staff routes.
 */
export const authenticate = (verifier) => async (req, _res, next) => {
  const auth = await bearer(req, verifier);
  if (auth.kind === 'customer') {
    throw new UnauthenticatedError('WRONG_TOKEN_KIND', 'This sign-in cannot be used here');
  }
  req.auth = auth;
  next();
};

/** Customer portal API: only a customer's token, and it must name the customer it is for. */
export const authenticateCustomer = (verifier) => async (req, _res, next) => {
  const auth = await bearer(req, verifier);
  if (auth.kind !== 'customer' || !auth.customerId) {
    throw new UnauthenticatedError('WRONG_TOKEN_KIND', 'This sign-in cannot be used here');
  }
  req.auth = auth;
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

/**
 * The signed-in customer as plain data for use cases. Both the tenant and the customer come from
 * the token, never from the request, so a customer can only ever see their own records.
 */
export const customerFrom = (req) => ({
  tenantId: req.auth.tenantId,
  customerId: req.auth.customerId,
  accountId: req.auth.userId,
  userId: req.auth.userId,
  name: req.auth.name,
  role: 'customer',
  permissions: [],
});
