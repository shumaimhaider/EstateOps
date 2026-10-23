import PropTypes from 'prop-types';

const money = PropTypes.shape({
  minor: PropTypes.number.isRequired,
  currency: PropTypes.string.isRequired,
});

export const propertyShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  unitNo: PropTypes.string.isRequired,
  kind: PropTypes.string.isRequired,
  projectName: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  planName: PropTypes.string.isRequired,
  total: money.isRequired,
  received: money.isRequired,
  pending: money.isRequired,
  overdue: money.isRequired,
  fines: money.isRequired,
  nextDueDate: PropTypes.string,
  installments: PropTypes.shape({
    total: PropTypes.number,
    paid: PropTypes.number,
    due: PropTypes.number,
    overdue: PropTypes.number,
    upcoming: PropTypes.number,
  }).isRequired,
});

export const invoiceShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  invoiceNo: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  dueDate: PropTypes.string.isRequired,
  amount: money.isRequired,
  balance: money.isRequired,
  payable: PropTypes.bool.isRequired,
});
