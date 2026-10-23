-- =============================================================================================
-- File storage metadata. Files live in object storage (S3 today); the database keeps only what is
-- needed to find them. The storage key is NEVER stored: it is built in code from these columns
--   <tenant_id>/<owner_type>/<owner_id>/<purpose>/<id>-<stored_name>
-- and the public address is <base url> + key, with the base url configured in one place. Moving to
-- another provider (Azure Blob, GCS) means copying the objects and changing that base url.
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.estateops_install_file_asset(s text) RETURNS void AS $fn$
BEGIN
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %1$I.file_asset (
      id            uuid PRIMARY KEY,
      tenant_id     uuid        NOT NULL,
      owner_type    text        NOT NULL,
      owner_id      uuid        NOT NULL,
      purpose       text        NOT NULL,
      stored_name   text        NOT NULL,
      original_name text        NOT NULL,
      content_type  text        NOT NULL,
      size_bytes    bigint      NOT NULL CONSTRAINT file_asset_size_chk CHECK (size_bytes > 0),
      status        text        NOT NULL DEFAULT 'pending'
                    CONSTRAINT file_asset_status_chk CHECK (status IN ('pending', 'ready', 'deleted')),
      created_by    uuid,
      created_at    timestamptz NOT NULL DEFAULT now(),
      ready_at      timestamptz
    )$f$, s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS file_asset_owner_idx ON %1$I.file_asset (tenant_id, owner_type, owner_id, purpose, status)', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS file_asset_pending_idx ON %1$I.file_asset (created_at) WHERE status = ''pending''', s);
END;
$fn$ LANGUAGE plpgsql;
