import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Event names and payload schemas shared by producers and consumers. Delivery is at-least-once
 * and can reorder, so payloads carry full snapshots or a monotonic `seq`.
 */
export const EVENT = Object.freeze({
  TENANT_UPSERTED: 'tenant.upserted',
  PROJECT_UPSERTED: 'project.upserted',
  UNIT_UPSERTED: 'unit.upserted',
  CUSTOMER_UPSERTED: 'customer.upserted',
  BOOKING_REQUESTED: 'booking.requested',
  UNIT_BOOKED: 'unit.booked',
  UNIT_BOOKING_REJECTED: 'unit.booking_rejected',
  BOOKING_CONFIRMED: 'booking.confirmed',
  SCHEDULE_CREATED: 'schedule.created',
  SCHEDULE_FAILED: 'schedule.failed',
  BOOKING_SUMMARY_CHANGED: 'booking.summary_changed',
  BOOKING_FULLY_PAID: 'booking.fully_paid',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_RECORDED: 'payment.recorded',
  FINE_RATE_CHANGED: 'fine_rate.changed',
  PAYMENT_COLLECTION_REQUESTED: 'payment.collection_requested',
  PAYMENT_CHARGE_SUCCEEDED: 'payment.charge_succeeded',
  PAYMENT_CHARGE_FAILED: 'payment.charge_failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  CONTRACT_STATUS_CHANGED: 'contract.status_changed',
});

const id = z.uuid();
const minor = z.number().int();
const date = z.iso.date();
const UNIT_KIND = z.enum(['plot', 'flat', 'villa', 'shop']);
const UNIT_STATUS = z.enum(['available', 'held', 'booked', 'sold', 'blocked']);

const unitSnapshot = z.object({
  id,
  unit_no: z.string(),
  kind: UNIT_KIND,
  project_id: id,
  project_name: z.string(),
});
const customerSnapshot = z.object({
  id,
  full_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

const chargeOutcome = z.object({
  transaction_id: id,
  invoice_id: id,
  booking_id: id,
  customer_id: id,
  amount: minor,
  currency: z.string().length(3),
  card_brand: z.string().nullable(),
  card_last4: z.string().nullable(),
  trigger: z.string(),
});

export const EVENT_SCHEMAS = Object.freeze({
  [EVENT.TENANT_UPSERTED]: z.object({
    slug: z.string(),
    name: z.string(),
    currency: z.string().length(3),
    locale: z.string(),
    time_zone: z.string(),
    area_unit: z.enum(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']),
  }),
  [EVENT.PROJECT_UPSERTED]: z.object({
    project_id: id,
    name: z.string(),
    kind: z.enum(['plot_society', 'tower', 'mixed']),
  }),
  [EVENT.UNIT_UPSERTED]: z.object({
    unit_id: id,
    project_id: id,
    project_name: z.string(),
    unit_no: z.string(),
    kind: UNIT_KIND,
    status: UNIT_STATUS,
    list_price: minor,
    currency: z.string().length(3),
  }),
  [EVENT.CUSTOMER_UPSERTED]: customerSnapshot.omit({ id: true }).extend({ customer_id: id }),
  [EVENT.BOOKING_REQUESTED]: z.object({ booking_id: id, unit_id: id, customer_id: id }),
  [EVENT.UNIT_BOOKED]: z.object({ booking_id: id, unit_id: id }),
  [EVENT.UNIT_BOOKING_REJECTED]: z.object({ booking_id: id, unit_id: id, reason: z.string() }),
  [EVENT.BOOKING_CONFIRMED]: z.object({
    booking_id: id,
    unit: unitSnapshot,
    customer: customerSnapshot,
    plan: z.object({
      name: z.string(),
      down_pct: z.number().int().min(0).max(100),
      installment_count: z.number().int().min(1),
    }),
    total_price: minor,
    currency: z.string().length(3),
    booked_at: date,
  }),
  [EVENT.SCHEDULE_CREATED]: z.object({ booking_id: id, invoices: z.number().int().min(1) }),
  // compensation: billing could not build the schedule, so sales must undo the booking
  [EVENT.SCHEDULE_FAILED]: z.object({ booking_id: id, reason: z.string() }),
  [EVENT.BOOKING_SUMMARY_CHANGED]: z.object({
    booking_id: id,
    customer_id: id,
    seq: z.number().int(),
    unit_no: z.string(),
    total_price: minor,
    currency: z.string().length(3),
    installments_total: z.number().int(),
    installments_paid: z.number().int(),
    installments_due: z.number().int(),
    installments_overdue: z.number().int(),
    installments_upcoming: z.number().int(),
    received_amount: minor,
    pending_amount: minor,
    overdue_amount: minor,
    fine_amount: minor,
    next_due_date: date.nullable(),
    escalated: z.boolean(),
  }),
  [EVENT.BOOKING_FULLY_PAID]: z.object({ booking_id: id }),
  [EVENT.BOOKING_COMPLETED]: z.object({ booking_id: id, unit_id: id }),
  [EVENT.BOOKING_CANCELLED]: z.object({ booking_id: id, unit_id: id, customer_id: id }),
  [EVENT.PAYMENT_RECORDED]: z.object({
    payment_id: id,
    installment_id: id,
    booking_id: id,
    amount: minor,
    source: z.enum(['manual', 'stripe']),
  }),
  // The daily collection job asks the payment worker to charge one invoice to the customer's saved card.
  // `attempt_key` is the same for repeats of the same attempt, so a replay never charges twice.
  [EVENT.PAYMENT_COLLECTION_REQUESTED]: z.object({
    invoice_id: id,
    booking_id: id,
    customer_id: id,
    attempt_key: z.string().min(1),
    attempt_no: z.number().int().min(1),
    reason: z.enum(['due', 'retry']),
  }),
  // What happened to a card charge, for the customer's email and any other listener.
  [EVENT.PAYMENT_CHARGE_SUCCEEDED]: chargeOutcome,
  [EVENT.PAYMENT_CHARGE_FAILED]: chargeOutcome.extend({
    failure_code: z.string(),
    failure_message: z.string(),
    will_retry: z.boolean(),
    retry_on: date.nullable(),
  }),
  [EVENT.PAYMENT_REFUNDED]: chargeOutcome.extend({ reason: z.string() }),
  [EVENT.FINE_RATE_CHANGED]: z.object({
    scope: z.enum(['default', 'project', 'unit', 'customer']),
    scope_id: id.nullable(),
    unit_kind: UNIT_KIND.nullable(),
  }),
  [EVENT.CONTRACT_STATUS_CHANGED]: z.object({
    contract_id: id,
    booking_id: id,
    status: z.enum(['draft', 'sent', 'viewed', 'signed', 'declined', 'voided']),
  }),
});

export const eventEnvelopeSchema = z.object({
  id,
  type: z.string(),
  tenant_id: id,
  occurred_at: z.iso.datetime(),
  producer: z.string(),
  version: z.literal(1),
  data: z.unknown(),
});

/** Builds a validated envelope. Throws if `data` does not match the event's schema. */
export function buildEvent({ type, tenantId, producer, data, now = new Date() }) {
  const schema = EVENT_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown event type: ${type}`);
  return {
    id: randomUUID(),
    type,
    tenant_id: tenantId,
    occurred_at: now.toISOString(),
    producer,
    version: 1,
    data: schema.parse(data),
  };
}

/** Parses a received envelope and its payload. Returns `{ ok, event?, error? }`. */
export function parseEvent(raw) {
  const envelope = eventEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, error: envelope.error.message };
  const schema = EVENT_SCHEMAS[envelope.data.type];
  if (!schema)
    return { ok: false, unknown: true, error: `Unknown event type ${envelope.data.type}` };
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) return { ok: false, error: data.error.message };
  return { ok: true, event: { ...envelope.data, data: data.data } };
}
