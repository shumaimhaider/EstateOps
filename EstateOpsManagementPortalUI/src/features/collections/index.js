/** Public surface of the collections feature (invoices, escalations, collection stats). */
export { default as InvoicesTable } from './components/InvoicesTable.jsx';
export { default as InvoiceStatusPill } from './components/InvoiceStatusPill.jsx';
export { default as PayInvoiceDialog } from './components/PayInvoiceDialog.jsx';
export { default as EscalationsTable } from './components/EscalationsTable.jsx';
export { default as StatsTiles } from './components/StatsTiles.jsx';
export { default as CollectionTrendChart } from './components/CollectionTrendChart.jsx';
export { default as InventoryByType } from './components/InventoryByType.jsx';
export { default as ProjectBreakdownTable } from './components/ProjectBreakdownTable.jsx';
export { default as InstallmentCounts } from './components/InstallmentCounts.jsx';
export { default as AgeingChart } from './components/AgeingChart.jsx';

export { useInvoicesQuery } from './hooks/useInvoicesQuery.js';
export { useRecordPaymentMutation } from './hooks/useRecordPaymentMutation.js';
export { useEscalationsQuery } from './hooks/useEscalationsQuery.js';
export { useSendNoticeMutation } from './hooks/useSendNoticeMutation.js';
export { useCollectionsStatsQuery } from './hooks/useCollectionsStatsQuery.js';
export { invoiceKeys, escalationKeys, statsKeys } from './hooks/collections.keys.js';

export * from './domain/installment.constants.js';
export { payableInvoices, canRecordPayment, isAdjusted } from './domain/installment.rules.js';
export { invoiceShape } from './domain/installment.model.js';
export { escalationShape } from './domain/escalation.model.js';
