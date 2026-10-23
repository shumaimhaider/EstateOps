import { z } from 'zod';

/**
 * Wire shape of an installment, presented as a scheduled invoice in the UI.
 * `balance` is computed by the server (amount - paid, 0 when waived/cancelled).
 * @typedef {z.infer<typeof installmentDtoSchema>} InstallmentDto
 */
export const installmentDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  booking_id: z.uuid(),
  invoice_no: z.string(),
  seq: z.number().int(),
  kind: z.enum(['down_payment', 'emi']),
  unit_no: z.string(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']),
  project_name: z.string(),
  buyer_name: z.string(),
  issued_on: z.iso.date(),
  due_date: z.iso.date(),
  amount: z.number().int(),
  original_amount: z.number().int(),
  adjustment_reason: z.string().nullable(),
  paid_amount: z.number().int(),
  balance: z.number().int(),
  fine_amount: z.number().int(),
  currency: z.string().length(3),
  status: z.enum(['scheduled', 'due', 'paid', 'overdue', 'waived', 'rescheduled', 'cancelled']),
  days_late: z.number().int(),
  paid_at: z.iso.datetime().nullable(),
  method: z.string().nullable(),
  payment_source: z.enum(['manual', 'stripe']).nullable(),
  received_on: z.iso.date().nullable(),
  payment_reference: z.string().nullable(),
  receipt_no: z.string().nullable(),
  allowed_actions: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

/**
 * Request body for POST /installments/{id}/pay (mark received by hand). `adjusted_amount` sets
 * a new invoice amount first and needs `adjustment_reason`.
 */
export const paymentWriteDtoSchema = z.object({
  method: z.enum(['cash', 'bank_transfer', 'online', 'cheque']),
  amount: z.number().int().positive().optional(),
  reference: z.string().optional(),
  received_on: z.iso.date().optional(),
  note: z.string().optional(),
  adjusted_amount: z.number().int().positive().optional(),
  adjustment_reason: z.string().optional(),
});
