import { z } from 'zod';
import { money } from '../../lib/money.js';

/** The few fields the new-booking form needs to offer a choice of unit, customer and plan. */
export const unitChoiceDtoSchema = z.object({
  id: z.uuid(),
  unit_no: z.string(),
  kind: z.string(),
  project_name: z.string(),
  list_price: z.number().int(),
  currency: z.string(),
  status: z.string(),
});
export const customerChoiceDtoSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});
export const planChoiceDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  down_pct: z.number(),
  installment_count: z.number().int(),
});

export const unitChoiceFromApi = (d) => ({
  id: d.id,
  unitNo: d.unit_no,
  kind: d.kind,
  projectName: d.project_name,
  price: money(d.list_price, d.currency),
});
export const customerChoiceFromApi = (d) => ({
  id: d.id,
  name: d.full_name,
  email: d.email ?? '',
  phone: d.phone ?? '',
});
export const planChoiceFromApi = (d) => ({
  id: d.id,
  name: d.name,
  downPct: d.down_pct,
  installments: d.installment_count,
});

/** Form values -> the create request. A blank date means "today" (the server decides). */
export const bookingRequestToApi = ({ unitId, customerId, planId, bookedAt }) => ({
  unit_id: unitId,
  customer_id: customerId,
  plan_id: planId,
  ...(bookedAt ? { booked_at: bookedAt } : {}),
});
