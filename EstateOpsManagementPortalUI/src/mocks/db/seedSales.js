import { faker } from '@faker-js/faker';
import { addDays, addMonths, atNoon, daysBetween, today } from '../engine/dates.js';

/**
 * Seeds a booking (buyer + plan) and a full installment schedule for every booked or sold unit.
 * Statuses are computed against the simulated "today" so the register has a realistic mix:
 * paid, part-paid, due, overdue (every ageing bucket), scheduled, and defaulters who reach the
 * escalation threshold.
 */
const PLANS = [
  { name: '20% down + 12 monthly', downPct: 20, count: 12 },
  { name: '25% down + 24 monthly', downPct: 25, count: 24 },
  { name: '30% down + 36 monthly', downPct: 30, count: 36 },
];
const PROFILES = [
  { value: 'good', weight: 58 },
  { value: 'late', weight: 20 },
  { value: 'partial', weight: 10 },
  { value: 'defaulter', weight: 12 },
];
const METHODS = ['bank_transfer', 'cash', 'online', 'cheque'];
export const GRACE_DAYS = 5;
const FINE_PERCENT = 2;
const PHONE_PREFIX = { pk: '+92 3', ae: '+971 5' };

const pad = (n, w = 6) => String(n).padStart(w, '0');

function pickBookedAt(db, status, profile) {
  const range =
    status === 'sold'
      ? ['2025-08-01', '2025-10-01']
      : profile === 'defaulter'
        ? ['2025-12-01', '2026-06-15']
        : ['2025-12-01', '2026-09-15'];
  return faker.date.between({ from: range[0], to: range[1] }).toISOString().slice(0, 10);
}

/** Settles one installment against `today` according to the buyer's payment behaviour. */
function settle(row, ctx) {
  const { now, profile, sold, stopAt, lastElapsedSeq } = ctx;
  const late = daysBetween(row.due_date, now);
  const unpaid = (paid = 0) => ({
    paid_amount: paid,
    paid_at: null,
    status: late <= 0 ? 'scheduled' : late <= GRACE_DAYS ? 'due' : 'overdue',
  });
  const paidOn = (date, fine = 0) => ({
    paid_amount: row.amount,
    paid_at: atNoon(date),
    status: 'paid',
    fine_amount: fine,
  });

  if (sold) return paidOn(row.due_date);
  if (late < 0 && row.seq !== 0) return unpaid();
  if (profile === 'good') return paidOn(row.due_date);
  if (profile === 'late') {
    if (faker.datatype.boolean({ probability: 0.3 })) {
      const paidDate = addDays(row.due_date, faker.number.int({ min: 6, max: 18 }));
      return daysBetween(paidDate, now) >= 0
        ? paidOn(paidDate, Math.round((row.amount * FINE_PERCENT) / 100))
        : unpaid();
    }
    return paidOn(row.due_date);
  }
  if (profile === 'defaulter') return row.seq <= stopAt ? paidOn(row.due_date) : unpaid();
  // partial: the most recent elapsed installment is only partly paid
  if (row.seq === lastElapsedSeq) {
    return unpaid(Math.round(row.amount * faker.number.float({ min: 0.4, max: 0.6 })));
  }
  return paidOn(row.due_date);
}

export function seedSales(db, tenant, owner) {
  const now = today(db);
  const counters = { invoice: 0, payment: 0 };
  const slug = tenant.slug.toUpperCase();
  const units = db.units.filter(
    (u) => u.tenant_id === tenant.id && (u.status === 'booked' || u.status === 'sold'),
  );

  const customers = [];
  const customerFor = () => {
    if (customers.length > 0 && faker.datatype.boolean({ probability: 0.18 })) {
      return faker.helpers.arrayElement(customers);
    }
    const name = faker.person.fullName();
    const pk = tenant.slug === 'pk';
    const customer = {
      id: faker.string.uuid(),
      tenant_id: tenant.id,
      full_name: name,
      phone: `${PHONE_PREFIX[tenant.slug]}${faker.string.numeric(2)} ${faker.string.numeric(7)}`,
      email: `${name
        .toLowerCase()
        .replace(/[^a-z]+/g, '.')
        .replace(/^\.|\.$/g, '')}@example.test`,
      id_number: pk
        ? `${faker.string.numeric(5)}-${faker.string.numeric(7)}-${faker.string.numeric(1)}`
        : `784-${faker.string.numeric(4)}-${faker.string.numeric(7)}-${faker.string.numeric(1)}`,
      city: faker.helpers.arrayElement(
        pk ? ['Lahore', 'Karachi', 'Islamabad'] : ['Dubai', 'Abu Dhabi', 'Sharjah'],
      ),
      preferred_language: pk
        ? faker.helpers.arrayElement(['en', 'ur'])
        : faker.helpers.arrayElement(['en', 'ar']),
      created_at: '2025-08-01T10:00:00.000Z',
      updated_at: '2025-08-01T10:00:00.000Z',
    };
    customers.push(customer);
    db.customers.push(customer);
    return customer;
  };

  for (const unit of units) {
    const sold = unit.status === 'sold';
    const profile = sold ? 'good' : faker.helpers.weightedArrayElement(PROFILES);
    const plan = sold ? PLANS[0] : faker.helpers.arrayElement(PLANS);
    const bookedAt = pickBookedAt(db, unit.status, profile);
    const customer = customerFor();
    const booking = {
      id: faker.string.uuid(),
      tenant_id: tenant.id,
      unit_id: unit.id,
      customer_id: customer.id,
      plan_name: plan.name,
      installment_count: plan.count,
      total_price: unit.list_price,
      currency: unit.currency,
      status: sold ? 'completed' : 'active',
      booked_at: bookedAt,
      created_at: atNoon(bookedAt),
      updated_at: atNoon(bookedAt),
      created_by: owner.id,
    };
    db.bookings.push(booking);
    unit.booking_id = booking.id;

    const down = Math.round((unit.list_price * plan.downPct) / 100);
    const rest = unit.list_price - down;
    const emi = Math.floor(rest / plan.count);
    const rows = [{ seq: 0, kind: 'down_payment', amount: down, due_date: bookedAt }];
    for (let i = 1; i <= plan.count; i += 1) {
      rows.push({
        seq: i,
        kind: 'emi',
        amount: i === plan.count ? rest - emi * (plan.count - 1) : emi,
        due_date: addMonths(bookedAt, i),
      });
    }
    const elapsed = rows.filter((r) => daysBetween(r.due_date, now) >= 0);
    const ctx = {
      now,
      profile,
      sold,
      stopAt: faker.number.int({ min: 0, max: 1 }),
      lastElapsedSeq: elapsed.at(-1)?.seq ?? 0,
    };

    for (const row of rows) {
      counters.invoice += 1;
      const result = { fine_amount: 0, ...settle(row, ctx) };
      if (result.status === 'overdue' && !result.fine_amount) {
        result.fine_amount = Math.round((row.amount * FINE_PERCENT) / 100);
      }
      const paid = result.paid_amount > 0;
      if (paid) counters.payment += 1;
      db.installments.push({
        id: faker.string.uuid(),
        tenant_id: tenant.id,
        booking_id: booking.id,
        seq: row.seq,
        kind: row.kind,
        invoice_no: `INV-${slug}-${pad(counters.invoice)}`,
        issued_on: addDays(row.due_date, -7) < bookedAt ? bookedAt : addDays(row.due_date, -7),
        due_date: row.due_date,
        amount: row.amount,
        paid_amount: result.paid_amount,
        fine_amount: result.fine_amount,
        status: result.status,
        paid_at: result.paid_at,
        method: paid ? faker.helpers.arrayElement(METHODS) : null,
        payment_reference: paid ? `PAY-${slug}-${pad(counters.payment)}` : null,
        receipt_no: result.status === 'paid' ? `RCT-${slug}-${pad(counters.payment)}` : null,
        created_at: booking.created_at,
        updated_at: result.paid_at ?? booking.created_at,
      });
    }
  }

  // A third of the escalated buyers have already been sent a notice letter.
  const missed = db.settings.escalationMissed;
  for (const booking of db.bookings.filter((b) => b.tenant_id === tenant.id)) {
    const overdue = db.installments.filter(
      (i) => i.booking_id === booking.id && i.status === 'overdue',
    ).length;
    if (overdue >= missed && faker.datatype.boolean({ probability: 0.33 })) {
      db.notices.push({
        booking_id: booking.id,
        tenant_id: tenant.id,
        sent_at: atNoon(addDays(now, -faker.number.int({ min: 1, max: 6 }))),
        sent_by: owner.id,
      });
    }
  }
}
