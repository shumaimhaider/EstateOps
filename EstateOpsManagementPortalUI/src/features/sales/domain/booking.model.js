import PropTypes from 'prop-types';

/**
 * A booking: a unit sold to a customer on an installment plan, with its register summary.
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{
 *   id: string, tenantId: string, unitId: string, unitNo: string, unitKind: string,
 *   projectId: string, projectName: string, customerId: string, buyerName: string,
 *   buyerPhone: string, buyerEmail: string,
 *   status: 'requested'|'in_review'|'confirmed'|'active'|'completed'|'cancelled',
 *   planName: string, totalPrice: Money,
 *   installments: { total: number, paid: number, due: number, overdue: number, upcoming: number },
 *   received: Money, pending: Money, overdue: Money, fines: Money, nextDueDate: string|null,
 *   isEscalated: boolean, bookedAt: string, allowedActions: string[]
 * }} Booking
 * @typedef {{
 *   search?: string, status?: string, kind?: string, projectId?: string, unitId?: string,
 *   customerId?: string, escalated?: boolean, sort?: { field: string, dir: 'asc'|'desc' }
 * }} BookingFilters
 */
const money = PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string });

export const bookingShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  unitNo: PropTypes.string.isRequired,
  unitKind: PropTypes.string.isRequired,
  projectName: PropTypes.string.isRequired,
  customerId: PropTypes.string.isRequired,
  buyerName: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  planName: PropTypes.string.isRequired,
  totalPrice: money.isRequired,
  received: money.isRequired,
  pending: money.isRequired,
  overdue: money.isRequired,
  installments: PropTypes.shape({
    total: PropTypes.number,
    paid: PropTypes.number,
    overdue: PropTypes.number,
    upcoming: PropTypes.number,
  }).isRequired,
  isEscalated: PropTypes.bool.isRequired,
});
