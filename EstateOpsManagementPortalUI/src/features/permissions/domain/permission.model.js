import PropTypes from 'prop-types';

/**
 * What each role may see and do in the portal. Owner and admin are locked to everything.
 * @typedef {{ key: string, group: string }} PermissionInfo
 * @typedef {{ role: string, permissions: string[], locked: boolean }} RoleAccess
 * @typedef {{ catalog: PermissionInfo[], roles: RoleAccess[] }} PermissionMatrix
 */
export const permissionMatrixShape = PropTypes.shape({
  catalog: PropTypes.arrayOf(
    PropTypes.shape({ key: PropTypes.string.isRequired, group: PropTypes.string.isRequired }),
  ).isRequired,
  roles: PropTypes.arrayOf(
    PropTypes.shape({
      role: PropTypes.string.isRequired,
      permissions: PropTypes.arrayOf(PropTypes.string).isRequired,
      locked: PropTypes.bool.isRequired,
    }),
  ).isRequired,
});
