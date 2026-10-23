/**
 * Root query keys shared across features. A payment changes properties, invoices and transactions
 * at once; features invalidate by root without importing each other.
 */
export const QUERY_ROOTS = Object.freeze({
  session: ['session'],
  properties: ['properties'],
  invoices: ['invoices'],
  contracts: ['contracts'],
  payments: ['payments'],
  support: ['support'],
});

/** Everything a money movement can change. */
export const MONEY_ROOTS = [QUERY_ROOTS.properties, QUERY_ROOTS.invoices];
