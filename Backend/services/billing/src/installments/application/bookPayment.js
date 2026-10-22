import { applyPayment } from '../domain/payment.js';
import { paymentRecorded } from './events.js';
import { refreshBooking } from './refreshBooking.js';

/**
 * Books a planned payment against a (locked) invoice: generated numbers, the changed invoice, the
 * ledger row, the audit entries and the events, all in the caller's transaction.
 */
export async function bookPayment({
  repos,
  actor,
  clock,
  invoice,
  plan,
  method,
  source,
  stripeIntentId = null,
}) {
  const tenant = await repos.tenantRefs.get(invoice.tenantId);
  const number = await repos.counters.next(invoice.tenantId, 'payment', 1);
  const slug = tenant.slug.toUpperCase();
  const suffix = String(number).padStart(6, '0');
  const now = clock.now();
  const { invoice: next, payment } = applyPayment(invoice, plan, {
    method,
    source,
    now,
    stripeIntentId,
    actor,
    numbers: { reference: `PAY-${slug}-${suffix}`, receipt: `RCT-${slug}-${suffix}` },
  });

  const saved = await repos.installments.update(next);
  await repos.payments.insert(payment);
  if (plan.adjustment) {
    await repos.audit.record({
      tenantId: invoice.tenantId,
      actor,
      action: 'installment.adjust_amount',
      subjectType: 'installment',
      subjectId: invoice.id,
      before: { amount: invoice.amount },
      after: { amount: saved.amount, reason: plan.adjustment.reason },
    });
  }
  await repos.audit.record({
    tenantId: invoice.tenantId,
    actor,
    action: source === 'stripe' ? 'installment.card_payment' : 'installment.record_payment',
    subjectType: 'installment',
    subjectId: invoice.id,
    before: { status: invoice.status, paidAmount: invoice.paidAmount },
    after: { status: saved.status, paidAmount: saved.paidAmount },
  });
  await repos.outbox.add(paymentRecorded(payment, now));
  await refreshBooking({ repos, tenantId: invoice.tenantId, bookingId: invoice.bookingId, clock });
  return { invoice: saved, payment };
}
