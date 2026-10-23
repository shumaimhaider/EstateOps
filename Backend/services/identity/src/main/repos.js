import {
  LoginHistoryRepositoryTypeorm,
  MfaChallengeRepositoryTypeorm,
  RefreshTokenRepositoryTypeorm,
} from '../auth/infrastructure/AuthRepositoriesTypeorm.js';
import {
  AccountTokenRepository,
  CustomerAccountRepository,
  CustomerLoginHistoryRepository,
  CustomerRefreshTokenRepository,
} from '../portal/infrastructure/PortalRepositories.js';
import { RolePermissionRepositoryTypeorm } from '../permissions/infrastructure/RolePermissionRepositoryTypeorm.js';
import { TenantRepositoryTypeorm } from '../tenants/infrastructure/TenantRepositoryTypeorm.js';
import { TenantRow } from '../tenants/infrastructure/tenantEntity.js';
import { UserRepositoryTypeorm } from '../users/infrastructure/UserRepositoryTypeorm.js';
import { UserRow } from '../users/infrastructure/userEntity.js';

export const ENTITIES = [TenantRow, UserRow];

/** The identity repositories bound to one transaction's EntityManager. */
export const buildRepos = (manager) => ({
  tenants: new TenantRepositoryTypeorm(manager),
  users: new UserRepositoryTypeorm(manager),
  rolePermissions: new RolePermissionRepositoryTypeorm(manager),
  mfaChallenges: new MfaChallengeRepositoryTypeorm(manager),
  refreshTokens: new RefreshTokenRepositoryTypeorm(manager),
  loginHistory: new LoginHistoryRepositoryTypeorm(manager),
  customerAccounts: new CustomerAccountRepository(manager),
  accountTokens: new AccountTokenRepository(manager),
  customerRefreshTokens: new CustomerRefreshTokenRepository(manager),
  customerLogins: new CustomerLoginHistoryRepository(manager),
});
