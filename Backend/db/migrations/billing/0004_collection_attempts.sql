-- billing: collection attempts
-- Expand, migrate, contract: never rename or drop in the same release that stops using a column.
-- The runner wraps this file in a transaction. Do not edit it once it has been applied anywhere.

-- One row per invoice the daily scan looked at: charged (queued for the payment worker) or skipped,
-- with the reason. The outcome of a charge is not copied here: it is read from the payment
-- transaction the worker wrote under the same attempt key, so it can never disagree with the ledger.
CREATE TABLE IF NOT EXISTS billing.collection_attempt (
  id          uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  run_date    date        NOT NULL,
  invoice_id  uuid        NOT NULL REFERENCES billing.installment (id) ON DELETE CASCADE,
  booking_id  uuid        NOT NULL,
  customer_id uuid        NOT NULL,
  attempt_key text        NOT NULL,
  attempt_no  int         NOT NULL DEFAULT 0,
  decision    text        NOT NULL CONSTRAINT collection_decision_chk CHECK (decision IN ('charge', 'skip')),
  -- why: due | retry (charged), or no_card | card_expired | in_flight | waiting | gave_up | needs_new_card (skipped)
  reason      text        NOT NULL,
  amount      bigint      NOT NULL CONSTRAINT collection_amount_chk CHECK (amount >= 0),
  currency    char(3)     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- a scan can run any number of times in a day: each decision is recorded once
CREATE UNIQUE INDEX IF NOT EXISTS collection_attempt_uq ON billing.collection_attempt (tenant_id, invoice_id, attempt_key);
CREATE INDEX IF NOT EXISTS collection_attempt_day_idx ON billing.collection_attempt (tenant_id, run_date, id);
