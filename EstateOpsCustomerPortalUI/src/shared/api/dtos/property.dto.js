import { z } from 'zod';

export const propertyDtoSchema = z.object({
  id: z.string(),
  unit_no: z.string(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']),
  project_name: z.string(),
  status: z.enum(['requested', 'confirmed', 'active', 'completed']),
  plan_name: z.string(),
  total_price: z.number().int(),
  currency: z.string().length(3),
  installments_total: z.number().int(),
  installments_paid: z.number().int(),
  installments_due: z.number().int(),
  installments_overdue: z.number().int(),
  installments_upcoming: z.number().int(),
  received_amount: z.number().int(),
  pending_amount: z.number().int(),
  overdue_amount: z.number().int(),
  fine_amount: z.number().int(),
  next_due_date: z.string().nullable(),
  booked_at: z.string(),
});

export const invoiceDtoSchema = z.object({
  id: z.string(),
  invoice_no: z.string(),
  kind: z.enum(['down_payment', 'emi']),
  seq: z.number().int(),
  status: z.enum(['scheduled', 'due', 'paid', 'overdue', 'waived']),
  issued_on: z.string(),
  due_date: z.string(),
  amount: z.number().int(),
  paid_amount: z.number().int(),
  balance: z.number().int(),
  fine_amount: z.number().int(),
  currency: z.string().length(3),
  days_late: z.number().int(),
  paid_at: z.string().nullable(),
  receipt_no: z.string().nullable(),
  payable: z.boolean(),
});

export const contractDtoSchema = z.object({
  id: z.string(),
  booking_id: z.string(),
  title: z.string(),
  kind: z.enum(['pandadoc', 'signed_upload']),
  status: z.enum(['sent', 'viewed', 'signed', 'declined']),
  version: z.number().int(),
  sent_at: z.string().nullable(),
  signed_at: z.string().nullable(),
  can_sign: z.boolean(),
  can_download: z.boolean(),
});

export const signingSessionDtoSchema = z.object({
  contract_id: z.string(),
  url: z.string().url(),
  expires_at: z.string(),
});

export const listDtoSchema = (item) =>
  z.object({ data: z.array(item), next_cursor: z.string().nullable() });
