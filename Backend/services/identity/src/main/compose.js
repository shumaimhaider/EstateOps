import { EVENT } from '@estateops/contracts';
import { assertMailer, createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { ApplyCustomerUpserted } from '../portal/application/ApplyCustomerUpserted.js';
import {
  CustomerLogin,
  CustomerLogout,
  CustomerRefresh,
  GetPortalMe,
} from '../portal/application/CustomerSignIn.js';
import {
  ChangePassword,
  ForgotPassword,
  SetPassword,
} from '../portal/application/PasswordFlows.js';
import {
  GetPortalAccess,
  SendAccessLink,
  SetPortalAccess,
} from '../portal/application/StaffPortalAccess.js';
import {
  createPortalAccessRoutes,
  createPortalAuthRoutes,
} from '../portal/interfaces/portalRoutes.js';
import { GetMe } from '../auth/application/GetMe.js';
import { Login } from '../auth/application/Login.js';
import { LoginThrottle } from '../auth/application/LoginThrottle.js';
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
  cache = null,
  mailer,
  portalUrl = 'http://localhost:5174',
}) {
  assertMailer(mailer);
  const auth = createAuthRoutes({
    login: new Login({
      uow,
      hasher,
      tokens,
      clock,
      throttle: cache ? new LoginThrottle({ cache }) : null,
    }),
    verifyTwoFactor: new VerifyTwoFactor({ uow, totp, signer, tokens, clock }),
    refreshSession: new RefreshSession({ uow, signer, tokens, clock }),
    logout: new Logout({ uow, tokens }),
    getMe: new GetMe({ uow }),
  });
  const customerThrottle = (scope, over = {}) =>
    cache ? new LoginThrottle({ cache, scope, ...over }) : null;
  const portalDeps = { uow, clock, tokens, hasher, mailer, portalUrl };
  const portalAuth = createPortalAuthRoutes({
    login: new CustomerLogin({
      uow,
      hasher,
      tokens,
      signer,
      clock,
      throttle: customerThrottle('portal'),
    }),
    refresh: new CustomerRefresh({ uow, signer, tokens, clock }),
    logout: new CustomerLogout({ uow, tokens }),
    forgotPassword: new ForgotPassword({
      ...portalDeps,
      throttle: customerThrottle('portal-forgot', {
        maxPerEmail: 5,
        maxPerAddress: 30,
        windowMs: 60 * 60_000,
      }),
    }),
    setPassword: new SetPassword(portalDeps),
    changePassword: new ChangePassword(portalDeps),
    getMe: new GetPortalMe({ uow }),
  });
  const portalAccess = createPortalAccessRoutes({
    getPortalAccess: new GetPortalAccess({ uow }),
    sendAccessLink: new SendAccessLink(portalDeps),
    setPortalAccess: new SetPortalAccess({ uow }),
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

  const handlers = {
    // a customer made in the management portal gets a portal account and an invitation
    [EVENT.CUSTOMER_UPSERTED]: (e) => new ApplyCustomerUpserted(portalDeps).execute(e),
  };
  const app = createServiceApp({
    name: 'identity',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    publicRouters: [auth.open],
    adminRouters: [auth.authed, users, permissions, tenant, portalAccess],
    portalPublicRouters: [portalAuth.open],
    portalRouters: [portalAuth.authed],
    internalRouters: [bootstrap, createEventConsumerRouter({ handlers, logger })],
  });
  return Object.assign(app, { handlers });
}
