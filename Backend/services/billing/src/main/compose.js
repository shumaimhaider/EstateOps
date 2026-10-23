import { EVENT } from '@estateops/contracts';
import { noCache } from '@estateops/kernel';
import { assertMailer, createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { CancelBookingInvoices } from '../installments/application/CancelBookingInvoices.js';
import { ChangeInvoiceStatus } from '../installments/application/ChangeInvoiceStatus.js';
import { CreateSchedule } from '../installments/application/CreateSchedule.js';
import { GetInstallment } from '../installments/application/GetInstallment.js';
import { ListInstallments } from '../installments/application/ListInstallments.js';
import { ListPayments } from '../installments/application/ListPayments.js';
import { RecordPayment } from '../installments/application/RecordPayment.js';
import { CollectDueInvoices } from '../payments/application/CollectDueInvoices.js';
import { ProcessCollectionRequest } from '../payments/application/ProcessCollectionRequest.js';
import { SendPaymentEmail } from '../payments/application/SendPaymentEmail.js';
import { ChargeSavedCard } from '../payments/application/ChargeSavedCard.js';
import { CreateCardSetupSession } from '../payments/application/CreateCardSetupSession.js';
import { CreateCheckoutSession } from '../payments/application/CreateCheckoutSession.js';
import { GetCheckoutSession } from '../payments/application/GetCheckoutSession.js';
import { HandleStripeEvent } from '../payments/application/HandleStripeEvent.js';
import {
  ListPaymentMethods,
  RemovePaymentMethod,
  SetActivePaymentMethod,
} from '../payments/application/PaymentMethods.js';
import { assertStripeGateway } from '../payments/application/stripeGatewayPort.js';
import { GetTransaction, ListTransactions } from '../payments/application/Transactions.js';
import { ListMyInvoices, ListMyTransactions } from '../payments/application/PortalReads.js';
import { createPortalPaymentRoutes } from '../payments/interfaces/portalPaymentRoutes.js';
import {
  ListCollectionAttempts,
  ListCollectionRuns,
} from '../payments/application/CollectionHistory.js';
import { createCollectionRoutes } from '../payments/interfaces/collectionRoutes.js';
import { createPaymentRoutes } from '../payments/interfaces/paymentRoutes.js';
import { createStripeWebhookRoutes } from '../payments/interfaces/stripeWebhookRoutes.js';
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
 * Composition root of the billing service. `gateway` is the Stripe port (see stripeGatewayPort);
 * `stripe` holds { publishableKey, returnUrl } for the embedded Checkout form.
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
  stripe,
  mailer,
  cache = noCache,
}) {
  assertStripeGateway(gateway);
  assertMailer(mailer);
  const deps = { uow, clock };
  const withGateway = { ...deps, gateway, stripe };
  const chargeSavedCard = new ChargeSavedCard(withGateway);
  const handleStripeEvent = new HandleStripeEvent(withGateway);
  const collectDueInvoices = new CollectDueInvoices(deps);
  const sendPaymentEmail = new SendPaymentEmail({ ...deps, mailer });
  const processCollection = new ProcessCollectionRequest({ ...withGateway, logger });
  const useCases = {
    listInstallments: new ListInstallments(deps),
    getInstallment: new GetInstallment(deps),
    listPayments: new ListPayments(deps),
    recordPayment: new RecordPayment(deps),
    createCheckoutSession: new CreateCheckoutSession(withGateway),
    createCardSetupSession: new CreateCardSetupSession(withGateway),
    getCheckoutSession: new GetCheckoutSession(withGateway),
    chargeSavedCard,
    listPaymentMethods: new ListPaymentMethods(deps),
    setActivePaymentMethod: new SetActivePaymentMethod(deps),
    removePaymentMethod: new RemovePaymentMethod(withGateway),
    listTransactions: new ListTransactions(deps),
    listCollectionRuns: new ListCollectionRuns(deps),
    listCollectionAttempts: new ListCollectionAttempts(deps),
    listMyInvoices: new ListMyInvoices(deps),
    listMyTransactions: new ListMyTransactions(deps),
    getTransaction: new GetTransaction(deps),
    changeInvoiceStatus: new ChangeInvoiceStatus(deps),
    listFineRules: new ListFineRules(deps),
    getEffectiveFineRule: new GetEffectiveFineRule(deps),
    saveFineRule: new SaveFineRule(deps),
    deleteFineRule: new DeleteFineRule(deps),
    listEscalations: new ListEscalations(deps),
    sendNotice: new SendNotice(deps),
    getCollectionStats: new GetCollectionStats({ ...deps, cache }),
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
    // money summaries changed: the cached collection figures are out of date
    [EVENT.BOOKING_SUMMARY_CHANGED]: (e) => cache.bump('stats', e.tenant_id),
    // the payment worker: the daily scan's requests, and the customer emails about the outcomes
    [EVENT.PAYMENT_COLLECTION_REQUESTED]: (e) => processCollection.execute(e),
    [EVENT.PAYMENT_CHARGE_SUCCEEDED]: (e) => sendPaymentEmail.execute(e),
    [EVENT.PAYMENT_CHARGE_FAILED]: (e) => sendPaymentEmail.execute(e),
    [EVENT.PAYMENT_REFUNDED]: (e) => sendPaymentEmail.execute(e),
  };
  const app = createServiceApp({
    name: 'billing',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [
      createInstallmentRoutes(useCases),
      createPaymentRoutes(useCases),
      createCollectionRoutes(useCases),
      createFineRuleRoutes(useCases),
      createEscalationRoutes(useCases),
      createStatsRoutes(useCases),
      createSettingsRoutes(useCases),
    ],
    portalRouters: [createPortalPaymentRoutes(useCases)],
    webhookRouters: [createStripeWebhookRoutes({ gateway, handleStripeEvent, logger })],
    internalRouters: [
      createEventConsumerRouter({ handlers, logger }),
      createJobRoutes({ sweepStatuses, collectDueInvoices, uow }),
    ],
  });
  return Object.assign(app, {
    sweepStatuses,
    collectDueInvoices,
    handlers,
    chargeSavedCard,
    handleStripeEvent,
  });
}
