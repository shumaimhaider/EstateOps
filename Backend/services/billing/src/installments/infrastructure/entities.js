import { EntitySchema } from 'typeorm';

const c = (type, extra = {}) => ({ type, ...extra });

export const InstallmentRow = new EntitySchema({
  name: 'InstallmentRow',
  tableName: 'installment',
  schema: 'billing',
  columns: {
    id: c('uuid', { primary: true }),
    tenant_id: c('uuid'),
    booking_id: c('uuid'),
    seq: c('int'),
    kind: c('text'),
    invoice_no: c('text'),
    issued_on: c('date'),
    due_date: c('date'),
    amount: c('bigint'),
    original_amount: c('bigint'),
    paid_amount: c('bigint'),
    fine_amount: c('bigint'),
    status: c('text'),
    paid_at: c('timestamptz', { nullable: true }),
    method: c('text', { nullable: true }),
    payment_source: c('text', { nullable: true }),
    received_on: c('date', { nullable: true }),
    payment_reference: c('text', { nullable: true }),
    receipt_no: c('text', { nullable: true }),
    adjustment_reason: c('text', { nullable: true }),
    project_id: c('uuid'),
    customer_id: c('uuid'),
    unit_id: c('uuid'),
    unit_kind: c('text'),
    created_at: c('timestamptz', { insert: false, update: false }),
    updated_at: c('timestamptz', { insert: false }),
    version: c('int', { insert: false }),
  },
});

export const PaymentRow = new EntitySchema({
  name: 'PaymentRow',
  tableName: 'payment',
  schema: 'billing',
  columns: {
    id: c('uuid', { primary: true }),
    tenant_id: c('uuid'),
    installment_id: c('uuid'),
    booking_id: c('uuid'),
    amount: c('bigint'),
    method: c('text'),
    source: c('text'),
    reference: c('text'),
    received_on: c('date'),
    note: c('text', { nullable: true }),
    stripe_intent_id: c('text', { nullable: true }),
    recorded_by: c('uuid', { nullable: true }),
    recorded_by_name: c('text', { nullable: true }),
    created_at: c('timestamptz', { insert: false, update: false }),
  },
});

export const PaymentIntentRow = new EntitySchema({
  name: 'PaymentIntentRow',
  tableName: 'payment_intent',
  schema: 'billing',
  columns: {
    id: c('uuid', { primary: true }),
    tenant_id: c('uuid'),
    installment_id: c('uuid'),
    provider_id: c('text'),
    client_secret: c('text'),
    amount: c('bigint'),
    currency: c('char', { length: 3 }),
    adjusted_amount: c('bigint', { nullable: true }),
    adjustment_reason: c('text', { nullable: true }),
    created_at: c('timestamptz', { insert: false, update: false }),
    updated_at: c('timestamptz', { insert: false }),
  },
});
