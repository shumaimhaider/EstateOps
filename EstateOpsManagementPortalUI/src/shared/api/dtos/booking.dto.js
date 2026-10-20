import { z } from 'zod';

/**
 * Wire shape of a booking (a unit sold to a customer on an installment plan) with its
 * installment-register summary computed by the server. Money: integer minor units + currency.
 * @typedef {z.infer<typeof bookingDtoSchema>} BookingDto
 */
export const bookingDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  unit_id: z.uuid(),
  unit_no: z.string(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']),
  project_id: z.uuid(),
  project_name: z.string(),
  customer_id: z.uuid(),
  buyer_name: z.string(),
  buyer_phone: z.string(),
  buyer_email: z.string(),
  status: z.enum(['requested', 'in_review', 'confirmed', 'active', 'completed', 'cancelled']),
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
  next_due_date: z.iso.date().nullable(),
  escalated: z.boolean(),
  booked_at: z.iso.date(),
  allowed_actions: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  created_by: z.uuid().nullable(),
});
