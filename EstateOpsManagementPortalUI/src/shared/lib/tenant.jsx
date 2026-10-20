import { createContext, useContext } from 'react';
import PropTypes from 'prop-types';

/**
 * Current tenant presentation settings (cross-cutting UI state). Slice 2 loads
 * these from tenant settings; slice 1 provides a static default.
 * @typedef {{ id: string, name: string, currency: string, locale: string, timeZone: string, areaUnit: string }} TenantInfo
 */
export const DEFAULT_TENANT = Object.freeze({
  id: 'pk',
  name: 'Pakistan developer',
  currency: 'PKR',
  locale: 'en-PK',
  timeZone: 'Asia/Karachi',
  areaUnit: 'marla',
});

const TenantContext = createContext(DEFAULT_TENANT);

export function TenantProvider({ tenant = DEFAULT_TENANT, children }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}
TenantProvider.propTypes = {
  tenant: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    currency: PropTypes.string,
    locale: PropTypes.string,
    timeZone: PropTypes.string,
    areaUnit: PropTypes.string,
  }),
  children: PropTypes.node,
};

export function useTenant() {
  return useContext(TenantContext);
}
