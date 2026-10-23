/** Public surface of the properties feature: the customer's properties and payment schedules. */
export { default as PortfolioSummary } from './components/PortfolioSummary.jsx';
export { default as PropertyCard } from './components/PropertyCard.jsx';
export { default as InvoiceTable } from './components/InvoiceTable.jsx';
export {
  usePropertiesQuery,
  usePropertyQuery,
  useInvoicesQuery,
  propertyKeys,
} from './hooks/properties.hooks.js';
export {
  nextToPay,
  isPayable,
  paidPercent,
  attention,
  portfolio,
} from './domain/property.rules.js';
export { propertyShape, invoiceShape } from './domain/property.model.js';
