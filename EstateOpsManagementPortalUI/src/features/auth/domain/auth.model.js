import PropTypes from 'prop-types';

/**
 * @typedef {{ id: string, slug: string, name: string, currency: string, locale: string, timeZone: string, areaUnit: string }} TenantInfo
 * @typedef {{ id: string, name: string, email: string, role: string, permissions: string[], tenant: TenantInfo }} User
 * @typedef {{ user: User, tokens: { access: string, refresh: string } }} Session
 */
export const userShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  permissions: PropTypes.arrayOf(PropTypes.string).isRequired,
  tenant: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    currency: PropTypes.string,
  }).isRequired,
});
