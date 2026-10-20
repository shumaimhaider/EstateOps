import { z } from 'zod';

/** Wire shape of a customer (buyer). ID numbers arrive already masked. */
export const customerDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  full_name: z.string(),
  phone: z.string(),
  email: z.string(),
  id_number_masked: z.string(),
  city: z.string(),
  preferred_language: z.string(),
  currency: z.string().length(3),
  bookings_count: z.number().int(),
  units_summary: z.array(z.string()),
  total_value: z.number().int(),
  received_amount: z.number().int(),
  pending_amount: z.number().int(),
  overdue_amount: z.number().int(),
  escalated_count: z.number().int(),
  allowed_actions: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
