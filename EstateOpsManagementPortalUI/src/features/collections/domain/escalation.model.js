import PropTypes from 'prop-types';

/**
 * @typedef {{
 *   id: string, bookingId: string, unitId: string, unitNo: string, unitKind: string,
 *   projectName: string, customerId: string, buyerName: string, buyerPhone: string,
 *   missedInstallments: number, overdue: {minor:number,currency:string},
 *   fine: {minor:number,currency:string}, oldestDueDate: string, daysLate: number,
 *   noticeSentAt: string|null, status: 'open'|'notice_sent', allowedActions: string[]
 * }} Escalation
 */
export const escalationShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  unitNo: PropTypes.string.isRequired,
  buyerName: PropTypes.string.isRequired,
  missedInstallments: PropTypes.number.isRequired,
  daysLate: PropTypes.number.isRequired,
  status: PropTypes.string.isRequired,
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});
