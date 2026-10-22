import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { GetMe } from '../auth/application/GetMe.js';
import { Login } from '../auth/application/Login.js';
import { Logout } from '../auth/application/Logout.js';
import { RefreshSession } from '../auth/application/RefreshSession.js';
import { VerifyTwoFactor } from '../auth/application/VerifyTwoFactor.js';
import { createAuthRoutes } from '../auth/interfaces/authRoutes.js';
import { ListRolePermissions } from '../permissions/application/ListRolePermissions.js';
import { UpdateRolePermissions } from '../permissions/application/UpdateRolePermissions.js';
import { createPermissionRoutes } from '../permissions/interfaces/permissionRoutes.js';
import { CreateTenant } from '../tenants/application/CreateTenant.js';
import { GetTenant } from '../tenants/application/GetTenant.js';
import { UpdateTenant } from '../tenants/application/UpdateTenant.js';
import {
  createTenantBootstrapRoutes,
  createTenantRoutes,
} from '../tenants/interfaces/tenantRoutes.js';
import { CreateUser } from '../users/application/CreateUser.js';
import { DeactivateUser } from '../users/application/DeactivateUser.js';
import { GetUser } from '../users/application/GetUser.js';
import { ListUsers } from '../users/application/ListUsers.js';
import { UpdateUser } from '../users/application/UpdateUser.js';
import { createUserRoutes } from '../users/interfaces/userRoutes.js';

/**
 * Composition root: the only place the identity service's pieces are wired together.
 * Everything with side effects (database, clock, hashing, JWT) comes in as an argument, so tests
 * can swap in fakes and the real server passes the real ones.
 */
export function composeIdentity({
  uow,
  clock,
  hasher,
  totp,
  tokens,
  signer,
  verifier,
  logger,
  internalToken,
  bootstrapToken,
  idempotencyStore = null,
  readyCheck,
}) {
  const auth = createAuthRoutes({
    login: new Login({ uow, hasher, tokens, clock }),
    verifyTwoFactor: new VerifyTwoFactor({ uow, totp, signer, tokens, clock }),
    refreshSession: new RefreshSession({ uow, signer, tokens, clock }),
    logout: new Logout({ uow, tokens }),
    getMe: new GetMe({ uow }),
  });
  const users = createUserRoutes({
    createUser: new CreateUser({ uow, hasher, totp }),
    listUsers: new ListUsers({ uow }),
    getUser: new GetUser({ uow }),
    updateUser: new UpdateUser({ uow, hasher }),
    deactivateUser: new DeactivateUser({ uow }),
  });
  const permissions = createPermissionRoutes({
    listRolePermissions: new ListRolePermissions({ uow }),
    updateRolePermissions: new UpdateRolePermissions({ uow }),
  });
  const tenant = createTenantRoutes({
    getTenant: new GetTenant({ uow }),
    updateTenant: new UpdateTenant({ uow, clock }),
  });
  const bootstrap = createTenantBootstrapRoutes({
    createTenant: new CreateTenant({ uow, hasher, totp, clock }),
    bootstrapToken,
  });

  return createServiceApp({
    name: 'identity',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    publicRouters: [auth.open],
    adminRouters: [auth.authed, users, permissions, tenant],
    // identity consumes no events, but acknowledges stray ones so a sender never retries them
    internalRouters: [bootstrap, createEventConsumerRouter({ handlers: {}, logger })],
  });
}
