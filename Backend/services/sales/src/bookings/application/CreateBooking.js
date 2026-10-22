import {
  ConflictError,
  NotFoundError,
  PERMISSION,
  assertCan,
  fieldError,
  today as todayOf,
} from '@estateops/kernel';
import { createBooking } from '../domain/booking.js';
import { bookingRequested } from './events.js';

/**
 * Sells a unit to a customer on a plan. Needs sales.manage. The booking starts `requested`; the
 * unit is reserved by inventory and the schedule built by billing as events flow back.
 * input: { actor, unitId, customerId, planId, bookedAt? }
 */
export class CreateBooking {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, unitId, customerId, planId, bookedAt }) {
    assertCan(actor, PERMISSION.SALES_MANAGE);
    if (!unitId) throw fieldError('unit_id', 'Choose a unit');
    if (!customerId) throw fieldError('customer_id', 'Choose a customer');
    if (!planId) throw fieldError('plan_id', 'Choose a payment plan');
    const today = todayOf(this.clock);

    return this.uow.run(async (repos) => {
      const unit = await repos.unitRefs.get(actor.tenantId, unitId);
      if (!unit)
        throw new NotFoundError('Unit not found. If it was just added, try again in a moment.');
      const customer = await repos.customerRefs.get(actor.tenantId, customerId);
      if (!customer)
        throw new NotFoundError(
          'Customer not found. If they were just added, try again in a moment.',
        );
      const plan = await repos.plans.findById(actor.tenantId, planId);
      if (!plan) throw new NotFoundError('Payment plan not found');

      const booking = createBooking({
        tenantId: actor.tenantId,
        unit,
        customer,
        plan,
        bookedAt: bookedAt ?? today,
        today,
        createdBy: actor.userId,
      });
      if (await repos.bookings.hasLiveBookingForUnit(unitId)) {
        throw new ConflictError('UNIT_ALREADY_BOOKED', 'This unit already has a booking');
      }
      await repos.bookings.insert(booking);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'booking.create',
        subjectType: 'booking',
        subjectId: booking.id,
        after: {
          unitNo: booking.unitNo,
          buyer: booking.buyerName,
          plan: booking.planName,
          totalPrice: booking.totalPrice,
        },
      });
      await repos.outbox.add(bookingRequested(booking, this.clock.now()));
      return booking;
    });
  }
}
