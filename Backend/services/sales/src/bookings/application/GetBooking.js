import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { bookingActions } from './allowedActions.js';

export class GetBooking {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const booking = await this.uow.read((repos) => repos.bookings.findById(actor.tenantId, id));
    if (!booking) throw new NotFoundError('Booking not found');
    return { booking, allowedActions: bookingActions(booking, actor) };
  }
}
