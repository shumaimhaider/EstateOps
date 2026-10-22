import { PERMISSION, can } from '@estateops/kernel';
import { canCancel } from '../domain/booking.js';

export const bookingActions = (booking, actor) =>
  can(actor, PERMISSION.SALES_MANAGE) && canCancel(booking) ? ['cancel'] : [];
