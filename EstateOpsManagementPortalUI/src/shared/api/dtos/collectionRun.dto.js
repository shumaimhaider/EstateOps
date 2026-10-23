import { z } from 'zod';

/** The automatic card collection, day by day: how each due invoice was handled and why. */
export const ATTEMPT_STATUS = z.enum([
  'queued',
  'in_progress',
  'succeeded',
  'failed',
  'refunded',
  'skipped',
]);

export const runDtoSchema = z.object({
  run_date: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
  invoices: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  refunded: z.number().int(),
  skipped: z.number().int(),
  waiting: z.number().int(),
  collected_amount: z.number().int(),
  failed_amount: z.number().int(),
  currency: z.string().nullable(),
});

export const runsPageDtoSchema = z.object({
  data: z.array(runDtoSchema),
  next_before: z.string().nullable(),
});

export const attemptDtoSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  invoice_no: z.string(),
  due_date: z.string(),
  booking_id: z.string(),
  customer_id: z.string(),
  customer_name: z.string(),
  unit_no: z.string(),
  project_name: z.string(),
  attempt_no: z.number().int(),
  reason: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: ATTEMPT_STATUS,
  category: z.string(),
  funds: z.enum(['sufficient', 'insufficient', 'unknown']).nullable(),
  summary: z.string(),
  stripe_code: z.string().nullable(),
  stripe_message: z.string().nullable(),
  card_brand: z.string().nullable(),
  card_last4: z.string().nullable(),
  stripe_payment_intent_id: z.string().nullable(),
  transaction_id: z.string().nullable(),
  will_retry: z.boolean(),
  retry_on: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export const attemptsPageDtoSchema = z.object({
  data: z.array(attemptDtoSchema),
  next_after: z.string().nullable(),
  summary: runDtoSchema.nullable(),
});
