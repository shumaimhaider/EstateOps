import { PERMISSION } from '@estateops/kernel';
import { invoiceMachine } from './invoice.js';

/**
 * What staff may do to an invoice right now. The state says whether it can still be paid; the role
 * decides how: mark received by hand, charge a card, adjust the amount, waive or cancel.
 */
export function invoiceActions(invoice, permissions) {
  const has = (key) => permissions.includes(key);
  const stateActions = invoiceMachine.staffActions(invoice.status);
  const actions = [];
  if (stateActions.includes('record_payment')) {
    if (has(PERMISSION.PAYMENTS_RECORD)) actions.push('record_payment');
    if (has(PERMISSION.PAYMENTS_CARD)) actions.push('pay_by_card');
    if (has(PERMISSION.INVOICES_ADJUST)) actions.push('adjust_amount');
  }
  for (const action of ['waive', 'cancel']) {
    if (stateActions.includes(action) && has(PERMISSION.INVOICES_ADJUST)) actions.push(action);
  }
  return actions;
}
