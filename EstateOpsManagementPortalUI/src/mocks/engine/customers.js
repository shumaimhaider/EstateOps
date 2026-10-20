import { MockApiError } from './errors.js';
import { compareValues, paginate, parseSort } from './pagination.js';
import { lookups, toBookingDto } from './bookings.js';

const SORTABLE = [
  'full_name',
  'bookings_count',
  'total_value',
  'received_amount',
  'pending_amount',
  'overdue_amount',
];

/** ID numbers are always masked in this slice (*****-*******-1); `buyer.id_number.view` comes with roles. */
const maskId = (id) => id.replace(/\d(?=(?:\D*\d){1})/g, '*');

function toCustomerDto(db, customer, lk) {
  const bookings = db.bookings
    .filter((b) => b.customer_id === customer.id)
    .map((b) => toBookingDto(db, b, lk));
  const sum = (key) => bookings.reduce((s, b) => s + b[key], 0);
  return {
    id: customer.id,
    tenant_id: customer.tenant_id,
    full_name: customer.full_name,
    phone: customer.phone,
    email: customer.email,
    id_number_masked: maskId(customer.id_number),
    city: customer.city,
    preferred_language: customer.preferred_language,
    currency: bookings[0]?.currency ?? 'PKR',
    bookings_count: bookings.length,
    units_summary: bookings.map((b) => b.unit_no),
    total_value: sum('total_price'),
    received_amount: sum('received_amount'),
    pending_amount: sum('pending_amount'),
    overdue_amount: sum('overdue_amount'),
    escalated_count: bookings.filter((b) => b.escalated).length,
    allowed_actions: [],
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

export function listCustomers(db, ctx, params) {
  const { q, has_overdue: hasOverdue, cursor, limit } = params;
  const sort = parseSort(params.sort, SORTABLE, { field: 'full_name', dir: 'asc' });
  const lk = lookups(db, ctx);
  const needle = q?.trim().toLowerCase();

  const dtos = db.customers
    .filter((c) => c.tenant_id === ctx.tenant.id)
    .map((c) => toCustomerDto(db, c, lk))
    .filter(
      (c) =>
        (hasOverdue !== 'true' || c.overdue_amount > 0) &&
        (!needle ||
          `${c.full_name} ${c.phone} ${c.email} ${c.units_summary.join(' ')}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort(
      (a, b) =>
        compareValues(a[sort.field], b[sort.field]) * (sort.dir === 'desc' ? -1 : 1) ||
        compareValues(a.id, b.id),
    );
  const page = paginate(dtos, { cursor, limit });
  return { items: page.items, cursors: page.cursors, nextCursor: page.nextCursor };
}

export function getCustomer(db, ctx, id) {
  const customer = db.customers.find((c) => c.id === id && c.tenant_id === ctx.tenant.id);
  if (!customer) throw new MockApiError(404, 'NOT_FOUND', 'Customer not found');
  return toCustomerDto(db, customer, lookups(db, ctx));
}
