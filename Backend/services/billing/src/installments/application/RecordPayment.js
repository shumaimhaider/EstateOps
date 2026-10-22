import {
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  can,
  today as todayOf,
} from '@estateops/kernel';
import { invoiceActions } from '../domain/actions.js';
import { MANUAL_METHODS, planPayment } from '../domain/payment.js';
import { bookPayment } from './bookPayment.js';

/**
 * Staff mark a payment received by hand: full or part, any past date, optionally adjusting the
 * invoice amount first. The invoice row is locked, so two people paying at once are serialised and
 * the second sees the new balance. input: { actor, id, input: { method, amount?, reference?, ... } }
 */
export class RecordPayment {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, input }) {
    assertCan(actor, PERMISSION.PAYMENTS_RECORD);
    return this.uow.run(async (repos) => {
      const invoice = await repos.installments.findById(actor.tenantId, id, { lock: true });
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!invoiceActions(invoice, actor.permissions).includes('record_payment')) {
        throw new InvalidTransitionError(`Cannot record a payment on a ${invoice.status} invoice`);
      }
      const reference = input.reference?.trim();
      const plan = planPayment(
        invoice,
        input,
        {
          today: todayOf(this.clock),
          canAdjust: can(actor, PERMISSION.INVOICES_ADJUST),
          referenceTaken: reference
            ? await repos.payments.referenceTaken(actor.tenantId, reference)
            : false,
        },
        { methods: MANUAL_METHODS },
      );
      const { invoice: saved } = await bookPayment({
        repos,
        actor,
        clock: this.clock,
        invoice,
        plan,
        method: input.method,
        source: 'manual',
      });
      return saved;
    });
  }
}
