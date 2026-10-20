import { MockApiError } from './errors.js';
import { compareValues, paginate, parseSort } from './pagination.js';
import { groupBy, summarize } from './register.js';

const SORTABLE = [
  'unit_no',
  'total_price',
  'received_amount',
  'pending_amount',
  'overdue_amount',
  'booked_at',
  'next_due_date',
];

export function lookups(db, ctx) {
  const projects = new Map(
    db.projects.filter((p) => p.tenant_id === ctx.tenant.id).map((p) => [p.id, p]),
  );
  const units = new Map(
    db.units.filter((u) => u.tenant_id === ctx.tenant.id).map((u) => [u.id, u]),
  );
  const customers = new Map(
    db.customers.filter((c) => c.tenant_id === ctx.tenant.id).map((c) => [c.id, c]),
  );
  const installmentsByBooking = groupBy(
    db.installments.filter((i) => i.tenant_id === ctx.tenant.id),
    'booking_id',
  );
  return { projects, units, customers, installmentsByBooking };
}

export function toBookingDto(db, booking, lk) {
  const unit = lk.units.get(booking.unit_id);
  const customer = lk.customers.get(booking.customer_id);
  const summary = summarize(lk.installmentsByBooking.get(booking.id) ?? []);
  return {
    id: booking.id,
    tenant_id: booking.tenant_id,
    unit_id: booking.unit_id,
    unit_no: unit.unit_no,
    unit_kind: unit.kind,
    project_id: unit.project_id,
    project_name: lk.projects.get(unit.project_id)?.name ?? '',
    customer_id: customer.id,
    buyer_name: customer.full_name,
    buyer_phone: customer.phone,
    buyer_email: customer.email,
    status: booking.status,
    plan_name: booking.plan_name,
    total_price: booking.total_price,
    currency: booking.currency,
    ...summary,
    escalated: summary.installments_overdue >= db.settings.escalationMissed,
    booked_at: booking.booked_at,
    allowed_actions: [],
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    created_by: booking.created_by,
  };
}

export function listBookings(db, ctx, params) {
  const {
    q,
    status,
    kind,
    project_id: projectId,
    unit_id: unitId,
    customer_id: customerId,
    escalated,
    cursor,
    limit,
  } = params;
  const sort = parseSort(params.sort, SORTABLE, { field: 'booked_at', dir: 'desc' });
  const lk = lookups(db, ctx);
  const needle = q?.trim().toLowerCase();

  let dtos = db.bookings
    .filter((b) => b.tenant_id === ctx.tenant.id)
    .map((b) => toBookingDto(db, b, lk))
    .filter(
      (b) =>
        (!status || b.status === status) &&
        (!kind || b.unit_kind === kind) &&
        (!projectId || b.project_id === projectId) &&
        (!unitId || b.unit_id === unitId) &&
        (!customerId || b.customer_id === customerId) &&
        (escalated !== 'true' || b.escalated) &&
        (!needle ||
          `${b.unit_no} ${b.buyer_name} ${b.project_name}`.toLowerCase().includes(needle)),
    );
  dtos = dtos.sort(
    (a, b) =>
      compareValues(a[sort.field], b[sort.field]) * (sort.dir === 'desc' ? -1 : 1) ||
      compareValues(a.id, b.id),
  );
  const page = paginate(dtos, { cursor, limit });
  return { items: page.items, cursors: page.cursors, nextCursor: page.nextCursor };
}

export function getBooking(db, ctx, id) {
  const booking = db.bookings.find((b) => b.id === id && b.tenant_id === ctx.tenant.id);
  if (!booking) throw new MockApiError(404, 'NOT_FOUND', 'Booking not found');
  return toBookingDto(db, booking, lookups(db, ctx));
}
