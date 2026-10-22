import { PERMISSION, can } from '@estateops/kernel';
import { hasBookings } from '../domain/customer.js';

/** `allowed_actions`: editing needs customers.manage; deleting also needs no bookings. */
export function customerActions(customer, actor) {
  if (!can(actor, PERMISSION.CUSTOMERS_MANAGE)) return [];
  return hasBookings(customer) ? ['update'] : ['update', 'delete'];
}
