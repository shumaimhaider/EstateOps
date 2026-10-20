import PropTypes from 'prop-types';

/**
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{
 *   id: string, tenantId: string, fullName: string, phone: string, email: string,
 *   idNumberMasked: string, city: string, preferredLanguage: string, bookingsCount: number,
 *   units: string[], totalValue: Money, received: Money, pending: Money, overdue: Money,
 *   escalatedCount: number, allowedActions: string[], createdAt: string, updatedAt: string
 * }} Customer
 * @typedef {{ search?: string, hasOverdue?: boolean, sort?: { field: string, dir: 'asc'|'desc' } }} CustomerFilters
 */
const money = PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string });

export const customerShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  fullName: PropTypes.string.isRequired,
  phone: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  idNumberMasked: PropTypes.string.isRequired,
  city: PropTypes.string.isRequired,
  bookingsCount: PropTypes.number.isRequired,
  units: PropTypes.arrayOf(PropTypes.string).isRequired,
  totalValue: money.isRequired,
  received: money.isRequired,
  pending: money.isRequired,
  overdue: money.isRequired,
  escalatedCount: PropTypes.number.isRequired,
});
