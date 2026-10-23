import { CounterRepositoryTypeorm } from '../installments/infrastructure/CounterRepositoryTypeorm.js';
import { BookingRefRepositoryTypeorm } from '../installments/infrastructure/BookingRefRepositoryTypeorm.js';
import { InstallmentRow, PaymentRow } from '../installments/infrastructure/entities.js';
import { InstallmentRepositoryTypeorm } from '../installments/infrastructure/InstallmentRepositoryTypeorm.js';
import { PaymentRepositoryTypeorm } from '../installments/infrastructure/PaymentRepositoriesTypeorm.js';
import {
  CheckoutSessionRepository,
  CollectionAttemptRepository,
  CollectionRepository,
  EmailLogRepository,
  JobRunRepository,
  PaymentMethodRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  TransactionRepository,
} from '../payments/infrastructure/PaymentRepositories.js';
import { SummaryRepositoryTypeorm } from '../installments/infrastructure/SummaryRepositoryTypeorm.js';
import { EscalationRepositoryTypeorm } from '../escalations/infrastructure/EscalationRepositoryTypeorm.js';
import { FineRuleRepositoryTypeorm } from '../fines/infrastructure/FineRuleRepositoryTypeorm.js';
import {
  CustomerRefRepositoryTypeorm,
  ProjectRefRepositoryTypeorm,
  TenantRefRepositoryTypeorm,
  UnitRefRepositoryTypeorm,
} from '../refs/infrastructure/RefRepositoriesTypeorm.js';
import { SettingsRepositoryTypeorm } from '../settings/infrastructure/SettingsRepositoryTypeorm.js';
import { StatsRepositoryTypeorm } from '../stats/infrastructure/StatsRepositoryTypeorm.js';

export const ENTITIES = [InstallmentRow, PaymentRow];

/** The billing repositories bound to one transaction's EntityManager. */
export const buildRepos = (manager) => ({
  installments: new InstallmentRepositoryTypeorm(manager),
  payments: new PaymentRepositoryTypeorm(manager),
  stripeCustomers: new StripeCustomerRepository(manager),
  paymentMethods: new PaymentMethodRepository(manager),
  checkouts: new CheckoutSessionRepository(manager),
  transactions: new TransactionRepository(manager),
  stripeEvents: new StripeEventRepository(manager),
  collection: new CollectionRepository(manager),
  collectionAttempts: new CollectionAttemptRepository(manager),
  jobRuns: new JobRunRepository(manager),
  emailLog: new EmailLogRepository(manager),
  bookingRefs: new BookingRefRepositoryTypeorm(manager),
  summaries: new SummaryRepositoryTypeorm(manager),
  counters: new CounterRepositoryTypeorm(manager),
  settings: new SettingsRepositoryTypeorm(manager),
  fines: new FineRuleRepositoryTypeorm(manager),
  escalations: new EscalationRepositoryTypeorm(manager),
  stats: new StatsRepositoryTypeorm(manager),
  tenantRefs: new TenantRefRepositoryTypeorm(manager),
  projectRefs: new ProjectRefRepositoryTypeorm(manager),
  unitRefs: new UnitRefRepositoryTypeorm(manager),
  customerRefs: new CustomerRefRepositoryTypeorm(manager),
});
