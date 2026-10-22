import { PERMISSION, assertCan, today as todayOf } from '@estateops/kernel';
import { invoiceActions } from '../domain/actions.js';
import { daysLate, outstanding } from '../domain/invoice.js';

export const INSTALLMENT_SORT_FIELDS = Object.freeze([
  'due_date',
  'amount',
  'balance',
  'status',
  'invoice_no',
  'seq',
]);

/** Turns a stored invoice view into what the register shows: balance, days late and allowed actions. */
export function toRegisterRow(view, actor, today) {
  const { invoice } = view;
  return {
    ...view,
    balance: outstanding(invoice),
    daysLate: daysLate(invoice, today),
    allowedActions: invoiceActions(invoice, actor.permissions),
  };
}

/** input: { actor, q, status, bookingId, customerId, projectId, unitKind, dueFrom, dueTo, sort, cursor, limit } */
export class ListInstallments {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const today = todayOf(this.clock);
    const page = await this.uow.read((repos) => repos.installments.list(actor.tenantId, filters));
    return { ...page, items: page.items.map((view) => toRegisterRow(view, actor, today)) };
  }
}
