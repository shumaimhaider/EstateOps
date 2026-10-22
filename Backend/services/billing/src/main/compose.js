import { EVENT } from '@estateops/contracts';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { CancelBookingInvoices } from '../installments/application/CancelBookingInvoices.js';
import { ChangeInvoiceStatus } from '../installments/application/ChangeInvoiceStatus.js';
import { ConfirmMockCardPayment } from '../installments/application/ConfirmMockCardPayment.js';
import { CreateCardPaymentIntent } from '../installments/application/CreateCardPaymentIntent.js';
import { CreateSchedule } from '../installments/application/CreateSchedule.js';
import { GetInstallment } from '../installments/application/GetInstallment.js';
import { ListInstallments } from '../installments/application/ListInstallments.js';
import { ListPayments } from '../installments/application/ListPayments.js';
import { RecordCardPayment } from '../installments/application/RecordCardPayment.js';
import { RecordPayment } from '../installments/application/RecordPayment.js';
import { createInstallmentRoutes } from '../installments/interfaces/installmentRoutes.js';
import { DeleteFineRule } from '../fines/application/DeleteFineRule.js';
import { GetEffectiveFineRule } from '../fines/application/GetEffectiveFineRule.js';
import { ListFineRules } from '../fines/application/ListFineRules.js';
import { ReapplyFineRate } from '../fines/application/ReapplyFineRate.js';
import { SaveFineRule } from '../fines/application/SaveFineRule.js';
import { createFineRuleRoutes } from '../fines/interfaces/fineRuleRoutes.js';
import { ListEscalations } from '../escalations/application/ListEscalations.js';
import { SendNotice } from '../escalations/application/SendNotice.js';
import { createEscalationRoutes } from '../escalations/interfaces/escalationRoutes.js';
import { SweepStatuses } from '../jobs/application/SweepStatuses.js';
import { createJobRoutes } from '../jobs/interfaces/jobRoutes.js';
import { ApplyCustomer } from '../refs/application/ApplyCustomer.js';
import { ApplyProject } from '../refs/application/ApplyProject.js';
import { ApplyTenant } from '../refs/application/ApplyTenant.js';
import { ApplyUnit } from '../refs/application/ApplyUnit.js';
import { GetSettings } from '../settings/application/GetSettings.js';
import { UpdateSettings } from '../settings/application/UpdateSettings.js';
import { createSettingsRoutes } from '../settings/interfaces/settingsRoutes.js';
import { GetCollectionStats } from '../stats/application/GetCollectionStats.js';
import { createStatsRoutes } from '../stats/interfaces/statsRoutes.js';

/**
 * Composition root of the billing service. `gateway` is the card provider port (a fake today);
 * `mockCard` mounts the development-only card confirmation route.
 */
export function composeBilling({
  uow,
  clock,
  gateway,
  verifier,
  logger,
  internalToken,
  idempotencyStore = null,
  readyCheck,
  mockCard = false,
}) {
  const deps = { uow, clock };
  const withGateway = { ...deps, gateway };
  const useCases = {
    listInstallments: new ListInstallments(deps),
    getInstallment: new GetInstallment(deps),
    listPayments: new ListPayments(deps),
    recordPayment: new RecordPayment(deps),
    createCardPaymentIntent: new CreateCardPaymentIntent(withGateway),
    recordCardPayment: new RecordCardPayment(withGateway),
    confirmMockCardPayment: new ConfirmMockCardPayment({ uow, gateway }),
    changeInvoiceStatus: new ChangeInvoiceStatus(deps),
    listFineRules: new ListFineRules(deps),
    getEffectiveFineRule: new GetEffectiveFineRule(deps),
    saveFineRule: new SaveFineRule(deps),
    deleteFineRule: new DeleteFineRule(deps),
    listEscalations: new ListEscalations(deps),
    sendNotice: new SendNotice(deps),
    getCollectionStats: new GetCollectionStats(deps),
    getSettings: new GetSettings(deps),
    updateSettings: new UpdateSettings(deps),
  };
  const sweepStatuses = new SweepStatuses(deps);
  const handlers = {
    [EVENT.TENANT_UPSERTED]: (e) => new ApplyTenant(deps).execute(e),
    [EVENT.PROJECT_UPSERTED]: (e) => new ApplyProject(deps).execute(e),
    [EVENT.UNIT_UPSERTED]: (e) => new ApplyUnit(deps).execute(e),
    [EVENT.CUSTOMER_UPSERTED]: (e) => new ApplyCustomer(deps).execute(e),
    [EVENT.BOOKING_CONFIRMED]: (e) => new CreateSchedule(deps).execute(e),
    [EVENT.BOOKING_CANCELLED]: (e) => new CancelBookingInvoices(deps).execute(e),
    [EVENT.FINE_RATE_CHANGED]: (e) => new ReapplyFineRate(deps).execute(e),
  };
  const app = createServiceApp({
    name: 'billing',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [
      createInstallmentRoutes(useCases, { mockCard }),
      createFineRuleRoutes(useCases),
      createEscalationRoutes(useCases),
      createStatsRoutes(useCases),
      createSettingsRoutes(useCases),
    ],
    internalRouters: [
      createEventConsumerRouter({ handlers, logger }),
      createJobRoutes({ sweepStatuses }),
    ],
  });
  return Object.assign(app, { sweepStatuses });
}
