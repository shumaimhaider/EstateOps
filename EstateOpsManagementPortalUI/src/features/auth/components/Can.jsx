import PropTypes from 'prop-types';
import { usePermission } from '../hooks/usePermissions.js';

/** Renders children only when the user holds `perm`; otherwise `fallback` (nothing by default). */
export default function Can({ perm, fallback = null, children }) {
  return usePermission(perm) ? children : fallback;
}

Can.propTypes = {
  perm: PropTypes.string.isRequired,
  fallback: PropTypes.node,
  children: PropTypes.node,
};
