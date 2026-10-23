import { EVENT } from '@estateops/contracts';
import { consumeOnce, newId } from '@estateops/kernel';
import { formatAmount } from '../domain/formatAmount.js';
import {
  chargeFailedEmail,
  chargeSucceededEmail,
  refundedEmail,
} from '../domain/emailTemplates.js';

const TEMPLATES = {
  [EVENT.PAYMENT_CHARGE_SUCCEEDED]: { name: 'charge_succeeded', build: chargeSucceededEmail },
  [EVENT.PAYMENT_CHARGE_FAILED]: { name: 'charge_failed', build: chargeFailedEmail },
  [EVENT.PAYMENT_REFUNDED]: { name: 'refunded', build: refundedEmail },
};

/**
 * Emails the customer about a card charge. One email per event: the log row is created before
 * sending and is the dedupe, so a redelivered event never sends twice, and a send that failed is
 * retried (the event is raised again) until it succeeds or lands in the dead-letter topic.
 * A customer with no email address is logged as skipped.
 */
export class SendPaymentEmail {
  constructor({ uow, clock, mailer }) {
    Object.assign(this, { uow, clock, mailer });
  }

  async execute(event) {
    const template = TEMPLATES[event.type];
    if (!template) return { skipped: 'unknown_event' };
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const d = event.data;
        const booking = await repos.bookingRefs.findById(event.tenant_id, d.booking_id);
        const invoice = await repos.installments.findById(event.tenant_id, d.invoice_id);
        const tenant = await repos.tenantRefs.get(event.tenant_id);
        const to = booking?.customerEmail ?? null;
        const row = await repos.emailLog.open({
          id: newId(),
          tenantId: event.tenant_id,
          eventId: event.id,
          template: template.name,
          to,
          subject: null,
        });
        if (row.status === 'sent' || row.status === 'skipped') return;
        if (!to || !booking || !invoice) {
          await repos.emailLog.mark(row.id, 'skipped', {
            error: to ? 'invoice or booking missing' : 'customer has no email',
          });
          return;
        }
        const message = template.build({
          customerName: booking.customerName,
          invoiceNo: invoice.invoiceNo,
          unitNo: booking.unitNo,
          amount: formatAmount(d.amount, d.currency, tenant?.locale ?? 'en'),
          cardBrand: d.card_brand,
          cardLast4: d.card_last4,
          receiptNo: invoice.receiptNo,
          failureMessage: d.failure_message,
          willRetry: d.will_retry,
          retryOn: d.retry_on,
        });
        try {
          const sent = await this.mailer.send({ to, ...message });
          await repos.emailLog.mark(row.id, 'sent', { providerId: sent.id });
        } catch (error) {
          await repos.emailLog.mark(row.id, 'failed', { error: error.message });
          throw error; // the whole event is retried; the processed marker rolls back with it
        }
      }),
    );
  }
}
