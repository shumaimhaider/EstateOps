/** Public surface of the customers feature. */
export { default as CustomersTable } from './components/CustomersTable.jsx';
export { default as CustomerFilters } from './components/CustomerFilters.jsx';
export { default as CustomerProfile } from './components/CustomerProfile.jsx';

export { useCustomersQuery } from './hooks/useCustomersQuery.js';
export { useCustomerQuery } from './hooks/useCustomerQuery.js';
export { useCustomerFilters } from './hooks/useCustomerFilters.js';
export { customerKeys } from './hooks/customer.keys.js';

export * from './domain/customer.constants.js';
export { customerShape } from './domain/customer.model.js';
