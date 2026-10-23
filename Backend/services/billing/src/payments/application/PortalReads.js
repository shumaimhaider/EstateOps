import { NotFoundError, today as todayOf } from '@estateops/kernel';
import { invoiceActions } from '../../installments/domain/actions.js';
import { daysLate, outstanding } from '../../installments/domain/invoice.js';

/** Statuses that are part of what a customer owes or has paid; cancelled and rescheduled ones are not shown. */
const SHOWN = new Set(['scheduled', 'due', 'paid', 'overdue', 'waived']);

/**
 * A property's invoices as its customer sees them. The booking must belong to the signed-in
 * customer (otherwise it is "not found", the same as a booking that does not exist).
 */
export class ListMyInvoices {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ customer, bookingId }) {
    const today = todayOf(this.clock);
    return this.uow.read(async (repos) => {
      const booking = await repos.bookingRefs.findById(customer.tenantId, bookingId);
      if (
        !booking ||
        booking.customerId !== customer.customerId ||
        booking.status === 'cancelled'
      ) {
        throw new NotFoundError('Property not found');
      }
      const page = await repos.installments.list(customer.tenantId, {
        bookingId,
        sort: 'seq:asc',
        limit: 200,
      });
      return page.items
        .filter(({ invoice }) => SHOWN.has(invoice.status))
        .map(({ invoice }) => ({
          invoice,
          currency: booking.currency,
          balance: outstanding(invoice),
          daysLate: daysLate(invoice, today),
          // can this be paid by card right now (the same rule staff use)
          payable: invoiceActions(invoice, ['payments.card']).includes('pay_by_card'),
        }));
    });
  }
}

/** The customer's own card payment attempts, newest first, without Stripe's raw answers. */
export class ListMyTransactions {
  constructor({ uow }) {
    Object.assign(this, { uow });
  }

  async execute({ customer, bookingId, installmentId, cursor, limit }) {
    const page = await this.uow.read((repos) =>
      repos.transactions.list(customer.tenantId, {
        customerId: customer.customerId,
        bookingId,
        installmentId,
        cursor,
        limit,
      }),
    );
    return {
      ...page,
      items: page.items.map(({ stripeResponse: _omit, createdByName: _by, ...t }) => t),
    };
  }
}
