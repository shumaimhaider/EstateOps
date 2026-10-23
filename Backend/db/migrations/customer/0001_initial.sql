-- =============================================================================================
-- customer service database. Owns schema "customer" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS customer;
SELECT public.estateops_install_service_tables('customer');

-- =============================================================================================
-- customer: buyers and their combined money position
-- =============================================================================================
CREATE TABLE IF NOT EXISTS customer.tenant_ref (
  tenant_id  uuid PRIMARY KEY,
  currency   char(3)     NOT NULL,
  source_at  timestamptz NOT NULL DEFAULT '-infinity',  -- when the source event happened: stale events are ignored
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer.customer (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid        NOT NULL,
  full_name          text        NOT NULL,
  phone              text,
  email              text,
  id_number          text,
  city               text,
  preferred_language text        NOT NULL DEFAULT 'en',
  bookings_count     int         NOT NULL DEFAULT 0 CONSTRAINT customer_bookings_chk CHECK (bookings_count >= 0),
  total_value        bigint      NOT NULL DEFAULT 0,
  received_amount    bigint      NOT NULL DEFAULT 0,
  pending_amount     bigint      NOT NULL DEFAULT 0,
  overdue_amount     bigint      NOT NULL DEFAULT 0,
  escalated_count    int         NOT NULL DEFAULT 0,
  units_summary      text[]      NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            int         NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_uq ON customer.customer (tenant_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_name_idx ON customer.customer (tenant_id, lower(full_name), id);
CREATE INDEX IF NOT EXISTS customer_overdue_idx ON customer.customer (tenant_id, overdue_amount) WHERE overdue_amount > 0;

CREATE TABLE IF NOT EXISTS customer.booking_summary (
  booking_id      uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  customer_id     uuid        NOT NULL REFERENCES customer.customer (id) ON DELETE RESTRICT,
  unit_no         text        NOT NULL,
  total_price     bigint      NOT NULL,
  currency        char(3)     NOT NULL,
  received_amount bigint      NOT NULL DEFAULT 0,
  pending_amount  bigint      NOT NULL DEFAULT 0,
  overdue_amount  bigint      NOT NULL DEFAULT 0,
  escalated       boolean     NOT NULL DEFAULT false,
  cancelled       boolean     NOT NULL DEFAULT false,
  seq             int         NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_summary_customer_idx ON customer.booking_summary (tenant_id, customer_id);
