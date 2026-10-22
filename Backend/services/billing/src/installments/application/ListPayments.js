import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** The payment ledger of one invoice, oldest first. */
export class ListPayments {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    return this.uow.read(async (repos) => {
      if (!(await repos.installments.findById(actor.tenantId, id)))
        throw new NotFoundError('Invoice not found');
      return repos.payments.listForInvoice(actor.tenantId, id);
    });
  }
}
