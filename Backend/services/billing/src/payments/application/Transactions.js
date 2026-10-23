import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** Card transactions across invoices, newest first. The raw Stripe answer is left out of lists. */
export class ListTransactions {
  constructor({ uow }) {
    Object.assign(this, { uow });
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const page = await this.uow.read((repos) => repos.transactions.list(actor.tenantId, filters));
    return { ...page, items: page.items.map(({ stripeResponse: _omit, ...t }) => t) };
  }
}

/** One transaction with everything Stripe sent, for finance to inspect. */
export class GetTransaction {
  constructor({ uow }) {
    Object.assign(this, { uow });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PAYMENTS_CARD);
    const found = await this.uow.read((repos) => repos.transactions.findById(actor.tenantId, id));
    if (!found) throw new NotFoundError('Transaction not found');
    return found;
  }
}
