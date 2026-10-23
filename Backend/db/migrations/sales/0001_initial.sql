-- =============================================================================================
-- sales service database. Owns schema "sales" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS sales;
SELECT public.estateops_install_service_tables('sales');

-- =============================================================================================
-- sales: payment plans and bookings
-- =============================================================================================
CREATE TABLE IF NOT EXISTS sales.customer_ref (
  customer_id uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  full_name   text        NOT NULL,
  phone       text,
  email       text,
  source_at    timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales.unit_ref (
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
CREATE INDEX IF NOT EXISTS sales_unit_ref_tenant_idx ON sales.unit_ref (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS sales.payment_plan (
  id                uuid PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  name              text        NOT NULL,
  down_pct          int         NOT NULL CONSTRAINT plan_down_pct_chk CHECK (down_pct BETWEEN 0 AND 100),
  installment_count int         NOT NULL CONSTRAINT plan_count_chk CHECK (installment_count BETWEEN 1 AND 120),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int         NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_name_uq ON sales.payment_plan (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS sales.booking (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid        NOT NULL,
  unit_id               uuid        NOT NULL,
  customer_id           uuid        NOT NULL,
  plan_id               uuid        NOT NULL REFERENCES sales.payment_plan (id) ON DELETE RESTRICT,
  plan_name             text        NOT NULL,
  down_pct              int         NOT NULL,
  installment_count     int         NOT NULL,
  status                text        NOT NULL DEFAULT 'requested' CONSTRAINT booking_status_chk CHECK (status IN
                          ('requested', 'confirmed', 'active', 'completed', 'cancelled')),
  total_price           bigint      NOT NULL CONSTRAINT booking_price_chk CHECK (total_price > 0),
  currency              char(3)     NOT NULL,
  booked_at             date        NOT NULL,
  cancel_reason         text,
  unit_no               text        NOT NULL,
  unit_kind             text        NOT NULL,
  project_id            uuid        NOT NULL,
  project_name          text        NOT NULL,
  buyer_name            text        NOT NULL,
  buyer_phone           text,
  buyer_email           text,
  installments_total    int         NOT NULL DEFAULT 0,
  installments_paid     int         NOT NULL DEFAULT 0,
  installments_due      int         NOT NULL DEFAULT 0,
  installments_overdue  int         NOT NULL DEFAULT 0,
  installments_upcoming int         NOT NULL DEFAULT 0,
  received_amount       bigint      NOT NULL DEFAULT 0,
  pending_amount        bigint      NOT NULL DEFAULT 0,
  overdue_amount        bigint      NOT NULL DEFAULT 0,
  fine_amount           bigint      NOT NULL DEFAULT 0,
  next_due_date         date,
  escalated             boolean     NOT NULL DEFAULT false,
  summary_seq           int         NOT NULL DEFAULT 0,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               int         NOT NULL DEFAULT 1
);
-- A unit has at most one live booking, so it can never be sold twice.
CREATE UNIQUE INDEX IF NOT EXISTS booking_unit_live_uq ON sales.booking (unit_id)
  WHERE status IN ('requested', 'confirmed', 'active', 'completed');
CREATE INDEX IF NOT EXISTS booking_status_idx ON sales.booking (tenant_id, status);
CREATE INDEX IF NOT EXISTS booking_customer_idx ON sales.booking (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS booking_project_idx ON sales.booking (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS booking_page_idx ON sales.booking (tenant_id, booked_at DESC, id);
