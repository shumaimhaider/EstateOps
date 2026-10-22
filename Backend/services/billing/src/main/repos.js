import { CounterRepositoryTypeorm } from '../installments/infrastructure/CounterRepositoryTypeorm.js';
import { BookingRefRepositoryTypeorm } from '../installments/infrastructure/BookingRefRepositoryTypeorm.js';
import {
  InstallmentRow,
  PaymentIntentRow,
  PaymentRow,
} from '../installments/infrastructure/entities.js';
import { InstallmentRepositoryTypeorm } from '../installments/infrastructure/InstallmentRepositoryTypeorm.js';
import {
  IntentRepositoryTypeorm,
  PaymentRepositoryTypeorm,
} from '../installments/infrastructure/PaymentRepositoriesTypeorm.js';
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

export const ENTITIES = [InstallmentRow, PaymentRow, PaymentIntentRow];

/** The billing repositories bound to one transaction's EntityManager. */
export const buildRepos = (manager) => ({
  installments: new InstallmentRepositoryTypeorm(manager),
  payments: new PaymentRepositoryTypeorm(manager),
  intents: new IntentRepositoryTypeorm(manager),
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
