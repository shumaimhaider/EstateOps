import {
  BookingSummaryRepositoryTypeorm,
  CustomerRepositoryTypeorm,
} from '../customers/infrastructure/CustomerRepositoryTypeorm.js';
import { CustomerRow } from '../customers/infrastructure/entities.js';
import { TenantRefRepositoryTypeorm } from '../tenants/infrastructure/TenantRefRepositoryTypeorm.js';

export const ENTITIES = [CustomerRow];

export const buildRepos = (manager) => ({
  customers: new CustomerRepositoryTypeorm(manager),
  bookingSummaries: new BookingSummaryRepositoryTypeorm(manager),
  tenantRefs: new TenantRefRepositoryTypeorm(manager),
});
