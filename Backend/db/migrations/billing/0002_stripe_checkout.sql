-- =============================================================================================
-- Stripe Embedded Checkout, saved cards and the transaction ledger.
--
--   stripe_customer     the Stripe customer that mirrors one EstateOps customer
--   payment_method      a saved card; a customer has many, exactly one is active at a time
--   checkout_session    an embedded Checkout session we opened (take a payment, or save a card)
--   payment_transaction every attempt to collect an invoice, with Stripe's own answer kept verbatim
--   stripe_event        every webhook received, so each is processed once and can be inspected
--
-- Card numbers never reach EstateOps: only the brand, last four digits and expiry are kept.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS billing.stripe_customer (
  tenant_id          uuid        NOT NULL,
  customer_id        uuid        NOT NULL,
  stripe_customer_id text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_customer_uq ON billing.stripe_customer (stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing.payment_method (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid        NOT NULL,
  customer_id              uuid        NOT NULL,
  stripe_payment_method_id text        NOT NULL,
  brand                    text        NOT NULL,
  last4                    char(4)     NOT NULL,
  exp_month                smallint    NOT NULL CONSTRAINT pm_exp_month_chk CHECK (exp_month BETWEEN 1 AND 12),
  exp_year                 smallint    NOT NULL,
  fingerprint              text,
  is_active                boolean     NOT NULL DEFAULT false,
  status                   text        NOT NULL DEFAULT 'active' CONSTRAINT pm_status_chk CHECK (status IN ('active', 'removed')),
  added_by                 uuid,
  added_by_name            text,
  added_via                text        NOT NULL DEFAULT 'staff' CONSTRAINT pm_via_chk CHECK (added_via IN ('staff', 'customer')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  removed_at               timestamptz,
  CONSTRAINT pm_active_needs_status_chk CHECK (NOT is_active OR status = 'active')
);
CREATE UNIQUE INDEX IF NOT EXISTS pm_stripe_uq ON billing.payment_method (stripe_payment_method_id);
-- one active card per customer at a time
CREATE UNIQUE INDEX IF NOT EXISTS pm_one_active_uq ON billing.payment_method (tenant_id, customer_id) WHERE is_active;
-- the same physical card is saved once per customer
CREATE UNIQUE INDEX IF NOT EXISTS pm_fingerprint_uq ON billing.payment_method (tenant_id, customer_id, fingerprint)
  WHERE status = 'active' AND fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_customer_idx ON billing.payment_method (tenant_id, customer_id, status, created_at);

CREATE TABLE IF NOT EXISTS billing.checkout_session (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid        NOT NULL,
  purpose             text        NOT NULL CONSTRAINT cs_purpose_chk CHECK (purpose IN ('payment', 'save_card')),
  customer_id         uuid        NOT NULL,
  installment_id      uuid REFERENCES billing.installment (id) ON DELETE RESTRICT,
  stripe_session_id   text        NOT NULL,
  amount              bigint,
  currency            char(3),
  adjusted_amount     bigint,
  adjustment_reason   text,
  save_card           boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'open' CONSTRAINT cs_status_chk CHECK (status IN ('open', 'complete', 'expired', 'failed')),
  created_by          uuid,
  created_by_name     text,
  created_via         text        NOT NULL DEFAULT 'staff' CONSTRAINT cs_via_chk CHECK (created_via IN ('staff', 'customer')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  CONSTRAINT cs_payment_chk CHECK (purpose <> 'payment' OR (installment_id IS NOT NULL AND amount > 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_stripe_uq ON billing.checkout_session (stripe_session_id);
CREATE INDEX IF NOT EXISTS cs_installment_idx ON billing.checkout_session (tenant_id, installment_id, created_at);

CREATE TABLE IF NOT EXISTS billing.payment_transaction (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid        NOT NULL,
  installment_id           uuid        NOT NULL REFERENCES billing.installment (id) ON DELETE RESTRICT,
  booking_id               uuid        NOT NULL,
  customer_id              uuid        NOT NULL,
  checkout_session_id      uuid REFERENCES billing.checkout_session (id) ON DELETE SET NULL,
  payment_method_id        uuid REFERENCES billing.payment_method (id) ON DELETE SET NULL,
  trigger                  text        NOT NULL CONSTRAINT tx_trigger_chk CHECK (trigger IN
                             ('staff_checkout', 'staff_saved_card', 'customer_checkout', 'customer_saved_card', 'scheduled')),
  amount                   bigint      NOT NULL CONSTRAINT tx_amount_chk CHECK (amount > 0),
  currency                 char(3)     NOT NULL,
  status                   text        NOT NULL DEFAULT 'pending' CONSTRAINT tx_status_chk CHECK (status IN
                             ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  stripe_refund_id         text,
  card_brand               text,
  card_last4               char(4),
  failure_code             text,
  failure_message          text,
  -- the last Stripe object received for this attempt (session, payment intent or error), unchanged
  stripe_response          jsonb,
  payment_id               uuid REFERENCES billing.payment (id) ON DELETE SET NULL,
  idempotency_key          text,
  created_by               uuid,
  created_by_name          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tx_idem_uq ON billing.payment_transaction (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tx_intent_uq ON billing.payment_transaction (tenant_id, stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tx_installment_idx ON billing.payment_transaction (tenant_id, installment_id, created_at);
CREATE INDEX IF NOT EXISTS tx_customer_idx ON billing.payment_transaction (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tx_status_idx ON billing.payment_transaction (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.stripe_event (
  id           text PRIMARY KEY,
  type         text        NOT NULL,
  payload      jsonb       NOT NULL,
  status       text        NOT NULL DEFAULT 'received' CONSTRAINT se_status_chk CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS se_status_idx ON billing.stripe_event (status, received_at);

-- The first card flow kept its state here; Stripe and payment_transaction replace it.
DROP TABLE IF EXISTS billing.payment_intent;
