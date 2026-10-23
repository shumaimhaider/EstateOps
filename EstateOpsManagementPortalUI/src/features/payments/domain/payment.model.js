import PropTypes from 'prop-types';

/**
 * @typedef {'pending'|'succeeded'|'failed'|'refunded'|'canceled'} TransactionStatus
 * @typedef {{
 *   id: string, invoiceId: string, bookingId: string, customerId: string, trigger: string,
 *   amount: { minor: number, currency: string }, status: TransactionStatus,
 *   cardBrand: string|null, cardLast4: string|null, paymentIntentId: string|null,
 *   chargeId: string|null, refundId: string|null, failureCode: string|null,
 *   failureMessage: string|null, paymentId: string|null, createdByName: string|null,
 *   createdAt: string, completedAt: string|null
 * }} Transaction
 * @typedef {{
 *   id: string, customerId: string, brand: string, last4: string, expMonth: number,
 *   expYear: number, isActive: boolean, expired: boolean, addedByName: string|null,
 *   addedVia: 'staff'|'customer', createdAt: string
 * }} PaymentMethod
 */
export const transactionShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  amount: PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string }).isRequired,
});

export const paymentMethodShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  brand: PropTypes.string.isRequired,
  last4: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
});
