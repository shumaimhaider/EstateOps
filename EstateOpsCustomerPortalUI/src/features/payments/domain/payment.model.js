import PropTypes from 'prop-types';

const money = PropTypes.shape({
  minor: PropTypes.number.isRequired,
  currency: PropTypes.string.isRequired,
});

/** The part of an invoice the payment dialog needs. */
export const invoiceShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  invoiceNo: PropTypes.string.isRequired,
  dueDate: PropTypes.string.isRequired,
  balance: money.isRequired,
});
