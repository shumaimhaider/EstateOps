import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { daysBetween, today } from './dates.js';
import { MockApiError } from './errors.js';
import { compareValues, paginate } from './pagination.js';
import { lookups } from './bookings.js';

/**
 * Escalation = a booking with N or more overdue installments (tenant setting, default 3).
 * Derived from the register on every read, so paying an installment resolves a case; only the
 * notice letters are stored.
 */
function build(db, booking, lk, ctx) {
  const rows = (lk.installmentsByBooking.get(booking.id) ?? []).filter(
    (i) => i.status === 'overdue',
  );
  if (rows.length < db.settings.escalationMissed) return null;
  const unit = lk.units.get(booking.unit_id);
  const oldest = rows.reduce((min, r) => (r.due_date < min ? r.due_date : min), rows[0].due_date);
  const customer = lk.customers.get(booking.customer_id);
  const notice = db.notices.find((n) => n.booking_id === booking.id);
  return {
    id: booking.id,
    tenant_id: booking.tenant_id,
    booking_id: booking.id,
    unit_id: unit.id,
    unit_no: unit.unit_no,
    unit_kind: unit.kind,
    project_name: lk.projects.get(unit.project_id)?.name ?? '',
    customer_id: customer.id,
    buyer_name: customer.full_name,
    buyer_phone: customer.phone,
    currency: booking.currency,
    missed_installments: rows.length,
    overdue_amount: rows.reduce((s, r) => s + (r.amount - r.paid_amount), 0),
    fine_amount: rows.reduce((s, r) => s + r.fine_amount, 0),
    oldest_due_date: oldest,
    days_late: daysBetween(oldest, today(db)),
    notice_sent_at: notice?.sent_at ?? null,
    status: notice ? 'notice_sent' : 'open',
    allowed_actions: notice ? [] : ['send_notice'],
    created_at: booking.created_at,
    updated_at: notice?.sent_at ?? booking.updated_at,
    created_by: ctx.user.id,
  };
}

export function listEscalations(db, ctx, { cursor, limit }) {
  const lk = lookups(db, ctx);
  const dtos = db.bookings
    .filter((b) => b.tenant_id === ctx.tenant.id)
    .map((b) => build(db, b, lk, ctx))
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.days_late - a.days_late ||
        compareValues(b.overdue_amount, a.overdue_amount) ||
        compareValues(a.id, b.id),
    );
  const page = paginate(dtos, { cursor, limit });
  return { items: page.items, cursors: page.cursors, nextCursor: page.nextCursor };
}

export function sendNotice(db, ctx, bookingId) {
  const booking = db.bookings.find((b) => b.id === bookingId && b.tenant_id === ctx.tenant.id);
  if (!booking) throw new MockApiError(404, 'NOT_FOUND', 'Escalated case not found');
  const lk = lookups(db, ctx);
  const current = build(db, booking, lk, ctx);
  if (!current)
    throw new MockApiError(409, 'INVALID_TRANSITION', 'This booking is no longer escalated');
  if (!current.allowed_actions.includes('send_notice')) {
    throw new MockApiError(409, 'INVALID_TRANSITION', 'A notice has already been sent');
  }
  const sentAt = nowIso(db.clock);
  db.notices.push({
    booking_id: booking.id,
    tenant_id: ctx.tenant.id,
    sent_at: sentAt,
    sent_by: ctx.user.id,
  });
  appendAudit(db, {
    actor: ctx.user,
    action: 'escalation.send_notice',
    subjectType: 'booking',
    subjectId: booking.id,
    before: { status: 'open' },
    after: { status: 'notice_sent', sent_at: sentAt },
  });
  return build(db, booking, lk, ctx);
}
