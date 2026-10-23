-- =============================================================================================
-- Automatic collection and customer email.
--
--   job_run    one row per job per day, so only one replica runs the daily collection scan
--   email_log  every email billing sends or skips, once per event, with the provider's answer
-- =============================================================================================
CREATE TABLE IF NOT EXISTS billing.job_run (
  job         text        NOT NULL,
  run_date    date        NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result      jsonb,
  error       text,
  PRIMARY KEY (job, run_date)
);

CREATE TABLE IF NOT EXISTS billing.email_log (
  id          uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  event_id    uuid        NOT NULL,
  template    text        NOT NULL,
  to_address  text,
  subject     text,
  status      text        NOT NULL DEFAULT 'pending' CONSTRAINT email_status_chk CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  provider_id text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
-- one email per event: a redelivered event finds its row and never sends twice
CREATE UNIQUE INDEX IF NOT EXISTS email_event_uq ON billing.email_log (event_id, template);
CREATE INDEX IF NOT EXISTS email_tenant_idx ON billing.email_log (tenant_id, created_at DESC);

-- The daily scan looks for unpaid invoices whose due date has come.
CREATE INDEX IF NOT EXISTS installment_collect_idx ON billing.installment (due_date, id)
  WHERE status IN ('scheduled', 'due', 'overdue');
CREATE INDEX IF NOT EXISTS tx_scheduled_idx ON billing.payment_transaction (installment_id, created_at)
  WHERE trigger = 'scheduled';
