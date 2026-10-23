import { z } from 'zod';

export const checkoutDtoSchema = z.object({
  checkout_id: z.string(),
  client_secret: z.string(),
  publishable_key: z.string(),
  amount: z.number().int().optional(),
  currency: z.string().optional(),
});

export const transactionDtoSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  booking_id: z.string(),
  trigger: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'canceled']),
  card_brand: z.string().nullable(),
  card_last4: z.string().nullable(),
  failure_message: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export const checkoutStatusDtoSchema = z.object({
  checkout_id: z.string(),
  purpose: z.enum(['payment', 'save_card']),
  status: z.enum(['open', 'complete', 'expired', 'failed']),
  transaction: transactionDtoSchema.nullable(),
});

export const paymentMethodDtoSchema = z.object({
  id: z.string(),
  brand: z.string(),
  last4: z.string(),
  exp_month: z.number().int(),
  exp_year: z.number().int(),
  is_active: z.boolean(),
  expired: z.boolean(),
  created_at: z.string(),
});
