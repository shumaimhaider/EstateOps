-- =============================================================================================
-- contract service database. Owns schema "contract" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS contract;
SELECT public.estateops_install_service_tables('contract');

-- =============================================================================================
-- contract: contracts and versions
-- =============================================================================================
CREATE TABLE IF NOT EXISTS contract.booking_ref (
  booking_id     uuid PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  customer_id    uuid        NOT NULL,
  customer_name  text        NOT NULL,
  customer_email text,
  unit_no        text        NOT NULL,
  cancelled      boolean     NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_booking_ref_idx ON contract.booking_ref (tenant_id);

CREATE TABLE IF NOT EXISTS contract.contract (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid        NOT NULL,
  booking_id           uuid        NOT NULL REFERENCES contract.booking_ref (booking_id) ON DELETE RESTRICT,
  kind                 text        NOT NULL CONSTRAINT contract_kind_chk CHECK (kind IN ('signed_upload', 'pandadoc')),
  title                text        NOT NULL,
  template             text        CONSTRAINT contract_template_chk CHECK (template IS NULL OR template IN
                         ('sale_agreement', 'payment_plan_addendum')),
  status               text        NOT NULL CONSTRAINT contract_status_chk CHECK (status IN
                         ('draft', 'sent', 'viewed', 'signed', 'declined', 'voided')),
  version              int         NOT NULL CONSTRAINT contract_version_chk CHECK (version >= 1),
  supersedes_id        uuid        REFERENCES contract.contract (id) ON DELETE RESTRICT,
  revision_note        text,
  file_key             text,
  file_name            text,
  file_size            bigint      CONSTRAINT contract_file_size_chk CHECK (file_size IS NULL OR file_size BETWEEN 1 AND 10485760),
  content_type         text,
  provider_document_id text,
  signer_email         text,
  sent_at              timestamptz,
  signed_at            timestamptz,
  created_by_name      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version_lock         int         NOT NULL DEFAULT 1,
  CONSTRAINT contract_booking_version_uq UNIQUE (booking_id, version),
  -- an uploaded copy is signed from the start and always has its file
  CONSTRAINT contract_upload_chk CHECK (kind <> 'signed_upload' OR
    (file_key IS NOT NULL AND file_size IS NOT NULL AND status IN ('signed', 'voided'))),
  -- a PandaDoc contract has no uploaded file and no revision of itself
  CONSTRAINT contract_pandadoc_chk CHECK (kind <> 'pandadoc' OR file_key IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_one_signed_uq ON contract.contract (booking_id) WHERE status = 'signed';
CREATE UNIQUE INDEX IF NOT EXISTS contract_one_open_uq ON contract.contract (booking_id)
  WHERE kind = 'pandadoc' AND status IN ('draft', 'sent', 'viewed', 'declined');
CREATE INDEX IF NOT EXISTS contract_booking_idx ON contract.contract (tenant_id, booking_id, version DESC);
