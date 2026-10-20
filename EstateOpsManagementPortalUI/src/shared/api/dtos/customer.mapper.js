import { money } from '../../lib/money.js';

const SORT_TO_WIRE = {
  fullName: 'full_name',
  bookingsCount: 'bookings_count',
  totalValue: 'total_value',
  received: 'received_amount',
  pending: 'pending_amount',
  overdue: 'overdue_amount',
};

/** @returns {import('../../../features/customers/domain/customer.model.js').Customer} */
export function fromApi(dto) {
  const c = dto.currency;
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    fullName: dto.full_name,
    phone: dto.phone,
    email: dto.email,
    idNumberMasked: dto.id_number_masked,
    city: dto.city,
    preferredLanguage: dto.preferred_language,
    bookingsCount: dto.bookings_count,
    units: dto.units_summary,
    totalValue: money(dto.total_value, c),
    received: money(dto.received_amount, c),
    pending: money(dto.pending_amount, c),
    overdue: money(dto.overdue_amount, c),
    escalatedCount: dto.escalated_count,
    allowedActions: dto.allowed_actions,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function filtersToApi(f) {
  return {
    q: f.search || undefined,
    has_overdue: f.hasOverdue ? 'true' : undefined,
    sort: f.sort ? `${SORT_TO_WIRE[f.sort.field]}:${f.sort.dir}` : undefined,
  };
}
