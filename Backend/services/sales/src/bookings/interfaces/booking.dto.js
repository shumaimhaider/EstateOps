import { z } from 'zod';
import { toIso } from '@estateops/kernel';

export const createBookingRequest = z.object({
  unit_id: z.string().optional(),
  customer_id: z.string().optional(),
  plan_id: z.string().optional(),
  booked_at: z.string().optional(),
});
export const cancelBookingRequest = z.object({ reason: z.string().max(300).optional() }).strict();

export const listBookingsQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  project_id: z.string().optional(),
  unit_id: z.string().optional(),
  customer_id: z.string().optional(),
  escalated: z.enum(['true', 'false']).optional(),
  sort: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

/** One booking with the installment-register summary billing reports. */
export const toBookingResponse = ({ booking: b, allowedActions }) => ({
  id: b.id,
  tenant_id: b.tenantId,
  unit_id: b.unitId,
  unit_no: b.unitNo,
  unit_kind: b.unitKind,
  project_id: b.projectId,
  project_name: b.projectName,
  customer_id: b.customerId,
  buyer_name: b.buyerName,
  buyer_phone: b.buyerPhone ?? '',
  buyer_email: b.buyerEmail ?? '',
  status: b.status,
  plan_name: b.planName,
  total_price: b.totalPrice,
  currency: b.currency,
  installments_total: b.installmentsTotal,
  installments_paid: b.installmentsPaid,
  installments_due: b.installmentsDue,
  installments_overdue: b.installmentsOverdue,
  installments_upcoming: b.installmentsUpcoming,
  received_amount: b.receivedAmount,
  pending_amount: b.pendingAmount,
  overdue_amount: b.overdueAmount,
  fine_amount: b.fineAmount,
  next_due_date: b.nextDueDate,
  escalated: b.escalated,
  booked_at: b.bookedAt,
  allowed_actions: allowedActions,
  created_at: toIso(b.createdAt),
  updated_at: toIso(b.updatedAt),
  created_by: b.createdBy,
});
