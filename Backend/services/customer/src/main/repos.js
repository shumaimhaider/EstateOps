import {
  BookingSummaryRepositoryTypeorm,
  CustomerRepositoryTypeorm,
} from '../customers/infrastructure/CustomerRepositoryTypeorm.js';
import { CustomerRow } from '../customers/infrastructure/entities.js';
import { SupportRepository } from '../support/infrastructure/SupportRepository.js';
import { TenantRefRepositoryTypeorm } from '../tenants/infrastructure/TenantRefRepositoryTypeorm.js';

export const ENTITIES = [CustomerRow];

export const buildRepos = (manager) => ({
  customers: new CustomerRepositoryTypeorm(manager),
  bookingSummaries: new BookingSummaryRepositoryTypeorm(manager),
  support: new SupportRepository(manager),
  tenantRefs: new TenantRefRepositoryTypeorm(manager),
});
