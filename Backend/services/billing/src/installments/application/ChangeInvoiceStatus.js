import { InvalidTransitionError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { invoiceActions } from '../domain/actions.js';
import { invoiceMachine } from '../domain/invoice.js';
import { refreshBooking } from './refreshBooking.js';

/** Waive or cancel an invoice. Needs invoices.adjust. input: { actor, id, action: 'waive' | 'cancel' } */
export class ChangeInvoiceStatus {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, action }) {
    assertCan(actor, PERMISSION.INVOICES_ADJUST);
    return this.uow.run(async (repos) => {
      const invoice = await repos.installments.findById(actor.tenantId, id, { lock: true });
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!invoiceActions(invoice, actor.permissions).includes(action)) {
        throw new InvalidTransitionError(`Cannot ${action} an invoice that is ${invoice.status}`);
      }
      const saved = await repos.installments.update({
        ...invoice,
        status: invoiceMachine.transition(invoice.status, action),
      });
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: `installment.${action}`,
        subjectType: 'installment',
        subjectId: id,
        before: { status: invoice.status },
        after: { status: saved.status },
      });
      await refreshBooking({
        repos,
        tenantId: actor.tenantId,
        bookingId: invoice.bookingId,
        clock: this.clock,
      });
      return saved;
    });
  }
}
