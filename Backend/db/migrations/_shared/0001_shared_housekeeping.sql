-- =============================================================================================
-- Shared installer. Every service database gets the same four housekeeping tables inside its own
-- schema: outbox, processed_event, idempotency_key and an append-only audit_log.
-- Applied by db/migrate.js before the service's own file (or by psql: \ir ../lib/shared.sql).
-- =============================================================================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm is not available; text search will use plain indexes';
END $$;

CREATE OR REPLACE FUNCTION public.estateops_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.estateops_install_service_tables(s text) RETURNS void AS $fn$
BEGIN
    -- Transactional outbox: written in the same transaction as the data, relayed afterwards.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.outbox (
        id              uuid PRIMARY KEY,
        tenant_id       uuid        NOT NULL,
        type            text        NOT NULL,
        payload         jsonb       NOT NULL,
        status          text        NOT NULL DEFAULT 'pending'
                        CONSTRAINT outbox_status_chk CHECK (status IN ('pending', 'published', 'dead')),
        attempts        int         NOT NULL DEFAULT 0 CONSTRAINT outbox_attempts_chk CHECK (attempts >= 0),
        delivered_to    text[]      NOT NULL DEFAULT '{}',
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error      text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        published_at    timestamptz
      )$f$, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS outbox_pending_idx ON %1$I.outbox (next_attempt_at, created_at) WHERE status = ''pending''', s);

    -- Events already applied by this service, so a redelivered event changes nothing.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.processed_event (
        event_id     uuid PRIMARY KEY,
        processed_at timestamptz NOT NULL DEFAULT now()
      )$f$, s);

    -- Stored responses for Idempotency-Key replays.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.idempotency_key (
        tenant_id    uuid        NOT NULL,
        key          text        NOT NULL,
        route        text        NOT NULL,
        request_hash text        NOT NULL,
        status       int         NOT NULL,
        body         jsonb,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, key, route)
      )$f$, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idempotency_key_age_idx ON %1$I.idempotency_key (created_at)', s);

    -- Append-only audit trail: who did what, with before and after.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.audit_log (
        id           uuid PRIMARY KEY,
        tenant_id    uuid        NOT NULL,
        actor_id     uuid,
        actor_name   text,
        action       text        NOT NULL,
        subject_type text        NOT NULL,
        subject_id   text        NOT NULL,
        before       jsonb,
        after        jsonb,
        created_at   timestamptz NOT NULL DEFAULT now()
      )$f$, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS audit_subject_idx ON %1$I.audit_log (tenant_id, subject_type, subject_id, created_at DESC)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS audit_time_idx ON %1$I.audit_log (tenant_id, created_at DESC)', s);
    EXECUTE format('CREATE OR REPLACE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON %1$I.audit_log FOR EACH ROW EXECUTE FUNCTION public.estateops_forbid_change()', s);
END;
$fn$ LANGUAGE plpgsql;
