export const INVOICE_STATUS_META = Object.freeze({
  scheduled: { labelKey: 'collections:status.scheduled', tone: 'neutral' },
  due: { labelKey: 'collections:status.due', tone: 'warning' },
  paid: { labelKey: 'collections:status.paid', tone: 'success' },
  overdue: { labelKey: 'collections:status.overdue', tone: 'danger' },
  waived: { labelKey: 'collections:status.waived', tone: 'info' },
  rescheduled: { labelKey: 'collections:status.rescheduled', tone: 'accent' },
  cancelled: { labelKey: 'collections:status.cancelled', tone: 'neutral' },
});

export const PAYMENT_METHODS = Object.freeze(['cash', 'bank_transfer', 'online', 'cheque']);
export const INVOICE_SORT_FIELDS = Object.freeze([
  'dueDate',
  'amount',
  'balance',
  'status',
  'invoiceNo',
  'sequence',
]);
export const INVOICES_PAGE_SIZE = 50;
export const ESCALATIONS_PAGE_SIZE = 25;
