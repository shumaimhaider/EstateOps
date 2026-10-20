import { z } from 'zod';

/** Wire shape of an escalated case: a booking with N or more overdue installments. */
export const escalationDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  booking_id: z.uuid(),
  unit_id: z.uuid(),
  unit_no: z.string(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']),
  project_name: z.string(),
  customer_id: z.uuid(),
  buyer_name: z.string(),
  buyer_phone: z.string(),
  currency: z.string().length(3),
  missed_installments: z.number().int(),
  overdue_amount: z.number().int(),
  fine_amount: z.number().int(),
  oldest_due_date: z.iso.date(),
  days_late: z.number().int(),
  notice_sent_at: z.iso.datetime().nullable(),
  status: z.enum(['open', 'notice_sent']),
  allowed_actions: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  created_by: z.uuid().nullable(),
});
