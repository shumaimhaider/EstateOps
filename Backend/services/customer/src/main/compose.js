import { EVENT } from '@estateops/contracts';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { ApplyBookingCancelled } from '../customers/application/ApplyBookingCancelled.js';
import { ApplyBookingSummary } from '../customers/application/ApplyBookingSummary.js';
import { CreateCustomer } from '../customers/application/CreateCustomer.js';
import { DeleteCustomer } from '../customers/application/DeleteCustomer.js';
import { GetCustomer } from '../customers/application/GetCustomer.js';
import { ListCustomers } from '../customers/application/ListCustomers.js';
import { UpdateCustomer } from '../customers/application/UpdateCustomer.js';
import { createCustomerRoutes } from '../customers/interfaces/customerRoutes.js';
import { ApplyTenant } from '../tenants/application/ApplyTenant.js';

/** Composition root of the customer service. */
export function composeCustomer({
  uow,
  clock,
  verifier,
  logger,
  internalToken,
  idempotencyStore = null,
  readyCheck,
}) {
  const deps = { uow, clock };
  const routes = createCustomerRoutes({
    listCustomers: new ListCustomers(deps),
    getCustomer: new GetCustomer(deps),
    createCustomer: new CreateCustomer(deps),
    updateCustomer: new UpdateCustomer(deps),
    deleteCustomer: new DeleteCustomer(deps),
  });
  const handlers = {
    [EVENT.TENANT_UPSERTED]: (e) => new ApplyTenant(deps).execute(e),
    [EVENT.BOOKING_SUMMARY_CHANGED]: (e) => new ApplyBookingSummary(deps).execute(e),
    [EVENT.BOOKING_CANCELLED]: (e) => new ApplyBookingCancelled(deps).execute(e),
  };
  return createServiceApp({
    name: 'customer',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [routes],
    internalRouters: [createEventConsumerRouter({ handlers, logger })],
  });
}
