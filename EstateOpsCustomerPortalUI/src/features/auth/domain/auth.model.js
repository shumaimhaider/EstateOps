import PropTypes from 'prop-types';

/**
 * @typedef {{ id: string, accountId: string, name: string, email: string, tenant: {
 *   id: string, slug: string, name: string, currency: string, locale: string, timeZone: string, areaUnit: string } }} Customer
 */
export const customerShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  tenant: PropTypes.shape({ slug: PropTypes.string.isRequired, name: PropTypes.string.isRequired })
    .isRequired,
});
