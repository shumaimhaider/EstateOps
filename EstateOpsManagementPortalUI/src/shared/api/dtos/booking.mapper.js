import { money } from '../../lib/money.js';

/**
 * @typedef {import('../../../features/sales/domain/booking.model.js').Booking} Booking
 * @typedef {import('../../../features/sales/domain/booking.model.js').BookingFilters} BookingFilters
 */
const SORT_TO_WIRE = {
  unitNo: 'unit_no',
  totalPrice: 'total_price',
  received: 'received_amount',
  pending: 'pending_amount',
  overdue: 'overdue_amount',
  bookedAt: 'booked_at',
  nextDue: 'next_due_date',
};

/** @param {import('./booking.dto.js').BookingDto} dto @returns {Booking} */
export function fromApi(dto) {
  const c = dto.currency;
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    unitId: dto.unit_id,
    unitNo: dto.unit_no,
    unitKind: dto.unit_kind,
    projectId: dto.project_id,
    projectName: dto.project_name,
    customerId: dto.customer_id,
    buyerName: dto.buyer_name,
    buyerPhone: dto.buyer_phone,
    buyerEmail: dto.buyer_email,
    status: dto.status,
    planName: dto.plan_name,
    totalPrice: money(dto.total_price, c),
    installments: {
      total: dto.installments_total,
      paid: dto.installments_paid,
      due: dto.installments_due,
      overdue: dto.installments_overdue,
      upcoming: dto.installments_upcoming,
    },
    received: money(dto.received_amount, c),
    pending: money(dto.pending_amount, c),
    overdue: money(dto.overdue_amount, c),
    fines: money(dto.fine_amount, c),
    nextDueDate: dto.next_due_date,
    isEscalated: dto.escalated,
    bookedAt: dto.booked_at,
    allowedActions: dto.allowed_actions,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    createdBy: dto.created_by,
  };
}

/** @param {BookingFilters} f */
export function filtersToApi(f) {
  return {
    q: f.search || undefined,
    status: f.status || undefined,
    kind: f.kind || undefined,
    project_id: f.projectId || undefined,
    unit_id: f.unitId || undefined,
    customer_id: f.customerId || undefined,
    escalated: f.escalated ? 'true' : undefined,
    sort: f.sort ? `${SORT_TO_WIRE[f.sort.field]}:${f.sort.dir}` : undefined,
  };
}
