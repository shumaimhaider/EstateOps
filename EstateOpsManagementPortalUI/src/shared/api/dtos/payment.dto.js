import { z } from 'zod';

/** Card payments: Stripe Embedded Checkout sessions, saved cards and the transaction ledger. */

/** Response of opening a checkout (payment or card setup). The secret goes to Stripe's form only. */
export const checkoutDtoSchema = z.object({
  checkout_id: z.string(),
  client_secret: z.string(),
  publishable_key: z.string(),
  amount: z.number().int().optional(),
  currency: z.string().optional(),
});

export const TRANSACTION_STATUS = z.enum([
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'canceled',
]);

export const transactionDtoSchema = z.object({
  id: z.string(),
  installment_id: z.string(),
  booking_id: z.string(),
  customer_id: z.string(),
  trigger: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: TRANSACTION_STATUS,
  card_brand: z.string().nullable(),
  card_last4: z.string().nullable(),
  stripe_payment_intent_id: z.string().nullable(),
  stripe_charge_id: z.string().nullable(),
  stripe_refund_id: z.string().nullable(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  payment_id: z.string().nullable(),
  created_by_name: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

/** The detail adds Stripe's stored answer, shown to those who may take card payments. */
export const transactionDetailDtoSchema = transactionDtoSchema.extend({
  stripe_response: z.unknown().nullable(),
});

export const checkoutStatusDtoSchema = z.object({
  checkout_id: z.string(),
  purpose: z.enum(['payment', 'save_card']),
  status: z.enum(['open', 'complete', 'expired', 'failed']),
  transaction: transactionDtoSchema.nullable(),
});

export const paymentMethodDtoSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  brand: z.string(),
  last4: z.string(),
  exp_month: z.number().int(),
  exp_year: z.number().int(),
  is_active: z.boolean(),
  expired: z.boolean(),
  added_by_name: z.string().nullable(),
  added_via: z.enum(['staff', 'customer']),
  created_at: z.string(),
});
