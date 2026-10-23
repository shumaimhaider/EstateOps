import { EVENT } from '@estateops/contracts';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { GetMyBooking, ListMyBookings } from '../bookings/application/MyBookings.js';
import { CancelBooking } from '../bookings/application/CancelBooking.js';
import { CreateBooking } from '../bookings/application/CreateBooking.js';
import { FollowSaga } from '../bookings/application/FollowSaga.js';
import { SweepStuckBookings } from '../bookings/application/SweepStuckBookings.js';
import { GetBooking } from '../bookings/application/GetBooking.js';
import { ListBookings } from '../bookings/application/ListBookings.js';
import {
  createBookingRoutes,
  createPortalPropertyRoutes,
} from '../bookings/interfaces/bookingRoutes.js';
import { CreatePlan } from '../plans/application/CreatePlan.js';
import { DeletePlan } from '../plans/application/DeletePlan.js';
import { GetPlan } from '../plans/application/GetPlan.js';
import { ListPlans } from '../plans/application/ListPlans.js';
import { UpdatePlan } from '../plans/application/UpdatePlan.js';
import { createPlanRoutes } from '../plans/interfaces/planRoutes.js';
import { ApplyCustomer } from '../refs/application/ApplyCustomer.js';
import { ApplyUnit } from '../refs/application/ApplyUnit.js';

/** Composition root of the sales service. */
export function composeSales({
  uow,
  clock,
  verifier,
  logger,
  internalToken,
  idempotencyStore = null,
  readyCheck,
  sagaTimeoutMs = 10 * 60_000,
  payments = null,
}) {
  const deps = { uow, clock };
  const sweepStuckBookings = new SweepStuckBookings({ ...deps, timeoutMs: sagaTimeoutMs });
  const bookings = createBookingRoutes({
    listBookings: new ListBookings(deps),
    getBooking: new GetBooking(deps),
    createBooking: new CreateBooking(deps),
    cancelBooking: new CancelBooking({ ...deps, payments }),
  });
  const plans = createPlanRoutes({
    listPlans: new ListPlans(deps),
    getPlan: new GetPlan(deps),
    createPlan: new CreatePlan(deps),
    updatePlan: new UpdatePlan(deps),
    deletePlan: new DeletePlan(deps),
  });
  const portalProperties = createPortalPropertyRoutes({
    listMyBookings: new ListMyBookings(deps),
    getMyBooking: new GetMyBooking(deps),
  });
  const saga = (step) => (event) => new FollowSaga({ ...deps, step }).execute(event);
  const handlers = {
    [EVENT.UNIT_UPSERTED]: (e) => new ApplyUnit(deps).execute(e),
    [EVENT.CUSTOMER_UPSERTED]: (e) => new ApplyCustomer(deps).execute(e),
    [EVENT.UNIT_BOOKED]: saga('confirmed'),
    [EVENT.UNIT_BOOKING_REJECTED]: saga('rejected'),
    [EVENT.SCHEDULE_CREATED]: saga('scheduled'),
    [EVENT.SCHEDULE_FAILED]: saga('scheduleFailed'),
    [EVENT.BOOKING_FULLY_PAID]: saga('paid'),
    [EVENT.BOOKING_SUMMARY_CHANGED]: saga('summary'),
  };
  const app = createServiceApp({
    name: 'sales',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [bookings, plans],
    portalRouters: [portalProperties],
    internalRouters: [createEventConsumerRouter({ handlers, logger })],
  });
  return Object.assign(app, { handlers, sweepStuckBookings });
}
