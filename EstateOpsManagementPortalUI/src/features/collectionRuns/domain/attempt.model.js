import PropTypes from 'prop-types';

const money = PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string });

export const ATTEMPT_STATUSES = [
  'succeeded',
  'failed',
  'refunded',
  'skipped',
  'queued',
  'in_progress',
];

export const runShape = PropTypes.shape({
  runDate: PropTypes.string.isRequired,
  invoices: PropTypes.number.isRequired,
  succeeded: PropTypes.number.isRequired,
  failed: PropTypes.number.isRequired,
  refunded: PropTypes.number.isRequired,
  skipped: PropTypes.number.isRequired,
  waiting: PropTypes.number.isRequired,
  collected: money,
  failedAmount: money,
  error: PropTypes.string,
});

export const attemptShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  invoiceNo: PropTypes.string.isRequired,
  customerName: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  summary: PropTypes.string.isRequired,
  funds: PropTypes.string,
  amount: money.isRequired,
});
