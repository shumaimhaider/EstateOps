import PropTypes from 'prop-types';

/**
 * A scheduled invoice (one installment of a booking's payment plan).
 * @typedef {'scheduled'|'due'|'paid'|'overdue'|'waived'|'rescheduled'|'cancelled'} InvoiceStatus
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{
 *   id: string, tenantId: string, bookingId: string, invoiceNo: string, sequence: number,
 *   kind: 'down_payment'|'emi', unitNo: string, unitKind: string, projectName: string,
 *   buyerName: string, issuedOn: string, dueDate: string, amount: Money, paid: Money,
 *   balance: Money, fine: Money, status: InvoiceStatus, daysLate: number, paidAt: string|null,
 *   method: string|null, paymentReference: string|null, receiptNo: string|null,
 *   allowedActions: string[], createdAt: string, updatedAt: string
 * }} Invoice
 * @typedef {{
 *   search?: string, status?: InvoiceStatus|'', bookingId?: string, customerId?: string,
 *   projectId?: string, unitKind?: string, dueFrom?: string, dueTo?: string,
 *   sort?: { field: string, dir: 'asc'|'desc' }
 * }} InvoiceFilters
 */
const money = PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string });

export const invoiceShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  invoiceNo: PropTypes.string.isRequired,
  sequence: PropTypes.number.isRequired,
  unitNo: PropTypes.string.isRequired,
  buyerName: PropTypes.string.isRequired,
  dueDate: PropTypes.string.isRequired,
  amount: money.isRequired,
  paid: money.isRequired,
  balance: money.isRequired,
  fine: money.isRequired,
  status: PropTypes.string.isRequired,
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});
