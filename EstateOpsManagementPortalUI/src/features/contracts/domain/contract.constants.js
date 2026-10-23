export const CONTRACT_STATUS_META = Object.freeze({
  draft: { labelKey: 'contracts:status.draft', tone: 'neutral' },
  sent: { labelKey: 'contracts:status.sent', tone: 'info' },
  viewed: { labelKey: 'contracts:status.viewed', tone: 'warning' },
  signed: { labelKey: 'contracts:status.signed', tone: 'success' },
  declined: { labelKey: 'contracts:status.declined', tone: 'danger' },
  voided: { labelKey: 'contracts:status.voided', tone: 'neutral' },
});

export const CONTRACT_TEMPLATES = Object.freeze(['sale_agreement', 'payment_plan_addendum']);
export const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;
