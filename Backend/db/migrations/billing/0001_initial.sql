-- =============================================================================================
-- billing service database. Owns schema "billing" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS billing;
SELECT public.estateops_install_service_tables('billing');

-- =============================================================================================
-- billing: invoices, payments, fines, escalations
-- =============================================================================================
CREATE TABLE IF NOT EXISTS billing.tenant_ref (
  tenant_id  uuid PRIMARY KEY,
  slug       text        NOT NULL,
  name       text        NOT NULL,
  currency   char(3)     NOT NULL,
  locale     text        NOT NULL,
  time_zone  text        NOT NULL,
  area_unit  text        NOT NULL,
  source_at    timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.project_ref (
  project_id uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  name       text        NOT NULL,
  kind       text        NOT NULL,
  source_at    timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_project_ref_idx ON billing.project_ref (tenant_id);

CREATE TABLE IF NOT EXISTS billing.unit_ref (
  unit_id      uuid PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  project_id   uuid        NOT NULL,
  project_name text        NOT NULL,
  unit_no      text        NOT NULL,
  kind         text        NOT NULL,
  status       text        NOT NULL,
  list_price   bigint      NOT NULL,
  currency     char(3)     NOT NULL,
  source_at    timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_unit_ref_idx ON billing.unit_ref (tenant_id, project_id, kind);

CREATE TABLE IF NOT EXISTS billing.customer_ref (
  customer_id uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  full_name   text        NOT NULL,
  phone       text,
  email       text,
  source_at    timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_ref_idx ON billing.customer_ref (tenant_id);

CREATE TABLE IF NOT EXISTS billing.collection_setting (
  tenant_id         uuid PRIMARY KEY,
  grace_days        int         NOT NULL DEFAULT 5 CONSTRAINT setting_grace_chk CHECK (grace_days BETWEEN 0 AND 60),
  escalation_missed int         NOT NULL DEFAULT 3 CONSTRAINT setting_escalation_chk CHECK (escalation_missed >= 1),
  updated_by_name   text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Per-tenant gap-free numbering (invoices, receipts, references): UPDATE ... RETURNING value.
CREATE TABLE IF NOT EXISTS billing.counter (
  tenant_id uuid   NOT NULL,
  name      text   NOT NULL,
  value     bigint NOT NULL DEFAULT 0 CONSTRAINT counter_value_chk CHECK (value >= 0),
  PRIMARY KEY (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS billing.booking_ref (
  booking_id     uuid PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  customer_id    uuid        NOT NULL,
  customer_name  text        NOT NULL,
  customer_phone text,
  customer_email text,
  unit_id        uuid        NOT NULL,
  unit_no        text        NOT NULL,
  unit_kind      text        NOT NULL,
  project_id     uuid        NOT NULL,
  project_name   text        NOT NULL,
  total_price    bigint      NOT NULL,
  currency       char(3)     NOT NULL,
  plan_name      text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active' CONSTRAINT billing_booking_status_chk CHECK (status IN
                   ('active', 'completed', 'cancelled')),
  booked_at      date        NOT NULL,
  summary_seq    int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_booking_customer_idx ON billing.booking_ref (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS billing_booking_project_idx ON billing.booking_ref (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS billing.installment (
  id                uuid PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  booking_id        uuid        NOT NULL REFERENCES billing.booking_ref (booking_id) ON DELETE RESTRICT,
  seq               int         NOT NULL CONSTRAINT installment_seq_chk CHECK (seq >= 0),
  kind              text        NOT NULL CONSTRAINT installment_kind_chk CHECK (kind IN ('down_payment', 'emi')),
  invoice_no        text        NOT NULL,
  issued_on         date        NOT NULL,
  due_date          date        NOT NULL,
  amount            bigint      NOT NULL CONSTRAINT installment_amount_chk CHECK (amount > 0),
  original_amount   bigint      NOT NULL CONSTRAINT installment_original_chk CHECK (original_amount > 0),
  paid_amount       bigint      NOT NULL DEFAULT 0 CONSTRAINT installment_paid_chk CHECK (paid_amount >= 0),
  fine_amount       bigint      NOT NULL DEFAULT 0 CONSTRAINT installment_fine_chk CHECK (fine_amount >= 0),
  status            text        NOT NULL DEFAULT 'scheduled' CONSTRAINT installment_status_chk CHECK (status IN
                      ('scheduled', 'due', 'paid', 'overdue', 'waived', 'rescheduled', 'cancelled')),
  paid_at           timestamptz,
  method            text,
  payment_source    text        CONSTRAINT installment_source_chk CHECK (payment_source IS NULL OR payment_source IN ('manual', 'stripe')),
  received_on       date,
  payment_reference text,
  receipt_no        text,
  adjustment_reason text,
  -- snapshots so lists, fines and stats never join across services
  project_id        uuid        NOT NULL,
  customer_id       uuid        NOT NULL,
  unit_id           uuid        NOT NULL,
  unit_kind         text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int         NOT NULL DEFAULT 1,
  CONSTRAINT installment_booking_seq_uq UNIQUE (booking_id, seq),
  CONSTRAINT installment_paid_within_amount_chk CHECK (paid_amount <= amount),
  CONSTRAINT installment_paid_state_chk CHECK (status <> 'paid' OR paid_amount = amount)
);
CREATE UNIQUE INDEX IF NOT EXISTS installment_invoice_no_uq ON billing.installment (tenant_id, invoice_no);
CREATE INDEX IF NOT EXISTS installment_status_due_idx ON billing.installment (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS installment_customer_idx ON billing.installment (tenant_id, customer_id, due_date);
CREATE INDEX IF NOT EXISTS installment_project_idx ON billing.installment (tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS installment_unit_idx ON billing.installment (tenant_id, unit_id);
CREATE INDEX IF NOT EXISTS installment_booking_idx ON billing.installment (tenant_id, booking_id, seq);
CREATE INDEX IF NOT EXISTS installment_page_idx ON billing.installment (tenant_id, due_date, id);
-- the daily sweep touches only unpaid, still-moving invoices
CREATE INDEX IF NOT EXISTS installment_sweep_idx ON billing.installment (due_date) WHERE status IN ('scheduled', 'due');

CREATE TABLE IF NOT EXISTS billing.payment (
  id               uuid PRIMARY KEY,
  tenant_id        uuid        NOT NULL,
  installment_id   uuid        NOT NULL REFERENCES billing.installment (id) ON DELETE RESTRICT,
  booking_id       uuid        NOT NULL,
  amount           bigint      NOT NULL CONSTRAINT payment_amount_chk CHECK (amount > 0),
  method           text        NOT NULL CONSTRAINT payment_method_chk CHECK (method IN
                     ('cash', 'bank_transfer', 'online', 'cheque', 'card')),
  source           text        NOT NULL CONSTRAINT payment_source_chk CHECK (source IN ('manual', 'stripe')),
  reference        text        NOT NULL,
  received_on      date        NOT NULL,
  note             text,
  stripe_intent_id text,
  recorded_by      uuid,
  recorded_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_card_chk CHECK ((source = 'stripe') = (stripe_intent_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_reference_uq ON billing.payment (tenant_id, reference);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intent_uq ON billing.payment (tenant_id, stripe_intent_id) WHERE stripe_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_installment_idx ON billing.payment (installment_id, created_at);
CREATE INDEX IF NOT EXISTS payment_booking_idx ON billing.payment (tenant_id, booking_id);

-- Card payments in flight. The stand-in provider keeps its state here; a real provider will hold it.
CREATE TABLE IF NOT EXISTS billing.payment_intent (
  id                uuid PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  installment_id    uuid        NOT NULL REFERENCES billing.installment (id) ON DELETE RESTRICT,
  provider_id       text        NOT NULL,
  client_secret     text        NOT NULL,
  amount            bigint      NOT NULL CONSTRAINT intent_amount_chk CHECK (amount > 0),
  currency          char(3)     NOT NULL,
  adjusted_amount   bigint,
  adjustment_reason text,
  status            text        NOT NULL DEFAULT 'requires_payment_method' CONSTRAINT intent_status_chk CHECK (status IN
                      ('requires_payment_method', 'succeeded')),
  charge_id         text,
  card_last4        text,
  recorded          boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intent_provider_uq ON billing.payment_intent (provider_id);
CREATE INDEX IF NOT EXISTS intent_installment_idx ON billing.payment_intent (tenant_id, installment_id);

CREATE TABLE IF NOT EXISTS billing.fine_rule (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  scope           text        NOT NULL CONSTRAINT fine_scope_chk CHECK (scope IN ('default', 'project', 'unit', 'customer')),
  scope_id        uuid,
  unit_kind       text        CONSTRAINT fine_unit_kind_chk CHECK (unit_kind IS NULL OR unit_kind IN ('plot', 'flat', 'villa', 'shop')),
  kind            text        NOT NULL CONSTRAINT fine_kind_chk CHECK (kind IN ('percent', 'fixed')),
  value           bigint      NOT NULL CONSTRAINT fine_value_chk CHECK (value >= 0),
  updated_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int         NOT NULL DEFAULT 1,
  -- the default has no target; every other level needs one
  CONSTRAINT fine_scope_target_chk CHECK ((scope = 'default') = (scope_id IS NULL)),
  -- a single property has one category, so no category rate for it
  CONSTRAINT fine_unit_scope_chk CHECK (scope <> 'unit' OR unit_kind IS NULL),
  -- percentage is basis points, at most 100%
  CONSTRAINT fine_percent_chk CHECK (kind <> 'percent' OR value <= 10000)
);
-- one rate per level and category (NULLs collide through coalesce, so this works on PG 14 too)
CREATE UNIQUE INDEX IF NOT EXISTS fine_rule_level_uq ON billing.fine_rule
  (tenant_id, scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(unit_kind, ''));
CREATE INDEX IF NOT EXISTS fine_rule_lookup_idx ON billing.fine_rule (tenant_id, scope, scope_id);

-- A cancellation that arrives before its booking was ever scheduled (events can reorder): remembered
-- so that a late booking.confirmed does not create a schedule for a cancelled booking.
CREATE TABLE IF NOT EXISTS billing.cancelled_booking (
  booking_id   uuid PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  cancelled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.escalation_notice (
  booking_id   uuid PRIMARY KEY REFERENCES billing.booking_ref (booking_id) ON DELETE RESTRICT,
  tenant_id    uuid        NOT NULL,
  sent_at      timestamptz NOT NULL,
  sent_by      uuid,
  sent_by_name text
);
CREATE INDEX IF NOT EXISTS escalation_notice_tenant_idx ON billing.escalation_notice (tenant_id);
