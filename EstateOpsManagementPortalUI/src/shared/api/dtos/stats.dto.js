import { z } from 'zod';

const UNIT_KIND = z.enum(['plot', 'flat', 'villa', 'shop']);

/**
 * Wire shape of GET /stats/collections. Pre-aggregated by the server from the installment
 * register, so charts never receive raw installment rows.
 */
export const collectionsStatsDtoSchema = z.object({
  currency: z.string().length(3),
  as_of: z.iso.date(),
  summary: z.object({
    total_sale_value: z.number().int(),
    received_amount: z.number().int(),
    pending_amount: z.number().int(),
    overdue_amount: z.number().int(),
    due_this_month_amount: z.number().int(),
    fine_amount: z.number().int(),
    installments_total: z.number().int(),
    installments_paid: z.number().int(),
    installments_due: z.number().int(),
    installments_overdue: z.number().int(),
    installments_upcoming: z.number().int(),
    bookings_count: z.number().int(),
    escalated_count: z.number().int(),
    units_total: z.number().int(),
    units_available: z.number().int(),
    units_booked: z.number().int(),
    units_sold: z.number().int(),
  }),
  by_month: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      due_amount: z.number().int(),
      collected_amount: z.number().int(),
    }),
  ),
  ageing: z.array(
    z.object({ bucket: z.string(), count: z.number().int(), amount: z.number().int() }),
  ),
  units_by_kind: z.array(
    z.object({
      kind: UNIT_KIND,
      total: z.number().int(),
      available: z.number().int(),
      held: z.number().int(),
      booked: z.number().int(),
      sold: z.number().int(),
      blocked: z.number().int(),
    }),
  ),
  by_project: z.array(
    z.object({
      project_id: z.uuid(),
      project_name: z.string(),
      units_total: z.number().int(),
      units_sold: z.number().int(),
      sale_value: z.number().int(),
      received_amount: z.number().int(),
      pending_amount: z.number().int(),
      overdue_amount: z.number().int(),
    }),
  ),
});
