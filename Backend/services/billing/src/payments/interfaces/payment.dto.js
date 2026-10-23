import { z } from 'zod';
import { toIso } from '@estateops/kernel';

const optInt = z.number().int().nullable().optional();

export const checkoutRequest = z.object({
  amount: optInt,
  adjusted_amount: optInt,
  adjustment_reason: z.string().nullable().optional(),
  save_card: z.boolean().optional(),
});
export const chargeSavedCardRequest = z.object({
  amount: optInt,
  adjusted_amount: optInt,
  adjustment_reason: z.string().nullable().optional(),
});
export const listTransactionsQuery = z.object({
  installment_id: z.string().optional(),
  invoice_id: z.string().optional(),
  customer_id: z.string().optional(),
  booking_id: z.string().optional(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'canceled']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

/** Wire request -> the use case's camelCase input; `null` counts as not sent. */
export const toCheckoutInput = (b) => ({
  amount: b.amount ?? undefined,
  adjustedAmount: b.adjusted_amount ?? undefined,
  adjustmentReason: b.adjustment_reason ?? undefined,
  saveCard: b.save_card ?? false,
});

export const toCheckoutResponse = (c) => ({
  checkout_id: c.checkoutId,
  client_secret: c.clientSecret,
  publishable_key: c.publishableKey,
  ...(c.amount !== undefined ? { amount: c.amount, currency: c.currency } : {}),
});

export const toPaymentMethodResponse = (m) => ({
  id: m.id,
  customer_id: m.customerId,
  brand: m.brand,
  last4: m.last4,
  exp_month: m.expMonth,
  exp_year: m.expYear,
  is_active: m.isActive,
  expired: Boolean(m.expired),
  added_by_name: m.addedByName,
  added_via: m.addedVia,
  created_at: toIso(m.createdAt),
});

/** The list shape: what happened, never the raw Stripe object. */
export const toTransactionResponse = (t) => ({
  id: t.id,
  installment_id: t.installmentId,
  booking_id: t.bookingId,
  customer_id: t.customerId,
  trigger: t.trigger,
  amount: t.amount,
  currency: t.currency,
  status: t.status,
  card_brand: t.cardBrand,
  card_last4: t.cardLast4,
  stripe_payment_intent_id: t.stripePaymentIntentId,
  stripe_charge_id: t.stripeChargeId,
  stripe_refund_id: t.stripeRefundId,
  failure_code: t.failureCode,
  failure_message: t.failureMessage,
  payment_id: t.paymentId,
  created_by_name: t.createdByName,
  created_at: toIso(t.createdAt),
  completed_at: t.completedAt ? toIso(t.completedAt) : null,
});

/** The detail shape adds the stored Stripe answer. */
export const toTransactionDetailResponse = (t) => ({
  ...toTransactionResponse(t),
  stripe_response: t.stripeResponse ?? null,
});

export const toCheckoutStatusResponse = ({ checkout, transaction }) => ({
  checkout_id: checkout.id,
  purpose: checkout.purpose,
  status: checkout.status,
  transaction: transaction ? toTransactionResponse(transaction) : null,
});
