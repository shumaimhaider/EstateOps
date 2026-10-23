-- =============================================================================================
-- inventory service database. Owns schema "inventory" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS inventory;
SELECT public.estateops_install_service_tables('inventory');

-- =============================================================================================
-- inventory: projects, structure, units
-- =============================================================================================
CREATE TABLE IF NOT EXISTS inventory.tenant_ref (
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

CREATE TABLE IF NOT EXISTS inventory.project (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  name       text        NOT NULL,
  location   text        NOT NULL DEFAULT '',
  kind       text        NOT NULL CONSTRAINT project_kind_chk CHECK (kind IN ('plot_society', 'tower', 'mixed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int         NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS project_name_uq ON inventory.project (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS inventory.phase (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  project_id uuid        NOT NULL REFERENCES inventory.project (id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS phase_name_uq ON inventory.phase (project_id, lower(name));

CREATE TABLE IF NOT EXISTS inventory.block (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  project_id uuid        NOT NULL REFERENCES inventory.project (id) ON DELETE RESTRICT,
  phase_id   uuid        REFERENCES inventory.phase (id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  kind       text        NOT NULL CONSTRAINT block_kind_chk CHECK (kind IN ('plot_block', 'building')),
  geometry   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS block_name_uq ON inventory.block (project_id, lower(name));

CREATE TABLE IF NOT EXISTS inventory.floor (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  block_id   uuid        NOT NULL REFERENCES inventory.block (id) ON DELETE RESTRICT,
  number     int         NOT NULL,
  label      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT floor_block_number_uq UNIQUE (block_id, number)
);

CREATE TABLE IF NOT EXISTS inventory.unit (
  id           uuid PRIMARY KEY,
  tenant_id    uuid          NOT NULL,
  project_id   uuid          NOT NULL REFERENCES inventory.project (id) ON DELETE RESTRICT,
  phase_id     uuid          REFERENCES inventory.phase (id) ON DELETE RESTRICT,
  block_id     uuid          REFERENCES inventory.block (id) ON DELETE RESTRICT,
  floor_id     uuid          REFERENCES inventory.floor (id) ON DELETE RESTRICT,
  unit_no      text          NOT NULL,
  kind         text          NOT NULL CONSTRAINT unit_kind_chk CHECK (kind IN ('plot', 'flat', 'villa', 'shop')),
  area_value   numeric(14,2) NOT NULL CONSTRAINT unit_area_chk CHECK (area_value > 0),
  area_unit    text          NOT NULL CONSTRAINT unit_area_unit_chk CHECK (area_unit IN ('marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m')),
  bedrooms     int           CONSTRAINT unit_bedrooms_chk CHECK (bedrooms IS NULL OR bedrooms >= 0),
  facing       text,
  view         text,
  corner       boolean       NOT NULL DEFAULT false,
  parking      int           NOT NULL DEFAULT 0 CONSTRAINT unit_parking_chk CHECK (parking >= 0),
  attributes   jsonb         NOT NULL DEFAULT '{}',
  status       text          NOT NULL DEFAULT 'available' CONSTRAINT unit_status_chk CHECK (status IN
                 ('available', 'held', 'booked', 'sold', 'blocked')),
  list_price   bigint        NOT NULL CONSTRAINT unit_price_chk CHECK (list_price >= 0),
  currency     char(3)       NOT NULL,
  geometry     jsonb,
  booking_id   uuid,         -- reference to sales.booking, no foreign key across schemas
  ever_booked  boolean       NOT NULL DEFAULT false,
  created_by   uuid,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),
  version      int           NOT NULL DEFAULT 1,
  -- a unit with a booking is booked or sold, never available
  CONSTRAINT unit_booking_status_chk CHECK (booking_id IS NULL OR status IN ('booked', 'sold'))
);
CREATE UNIQUE INDEX IF NOT EXISTS unit_no_uq ON inventory.unit (tenant_id, project_id, lower(unit_no));
CREATE INDEX IF NOT EXISTS unit_project_status_idx ON inventory.unit (tenant_id, project_id, status, kind);
CREATE INDEX IF NOT EXISTS unit_status_idx ON inventory.unit (tenant_id, status);
CREATE INDEX IF NOT EXISTS unit_kind_idx ON inventory.unit (tenant_id, kind);
CREATE INDEX IF NOT EXISTS unit_page_idx ON inventory.unit (tenant_id, unit_no, id);

CREATE TABLE IF NOT EXISTS inventory.unit_status_history (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  unit_id         uuid        NOT NULL REFERENCES inventory.unit (id) ON DELETE RESTRICT,
  status          text        NOT NULL CONSTRAINT unit_history_status_chk CHECK (status IN
                    ('available', 'held', 'booked', 'sold', 'blocked')),
  changed_by      uuid,
  changed_by_name text,
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_history_idx ON inventory.unit_status_history (unit_id, changed_at);

CREATE TABLE IF NOT EXISTS inventory.unit_media (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  unit_id    uuid        NOT NULL REFERENCES inventory.unit (id) ON DELETE CASCADE,
  kind       text        NOT NULL CONSTRAINT unit_media_kind_chk CHECK (kind IN ('image', 'floor_plan')),
  url        text        NOT NULL,
  caption    text,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_media_unit_idx ON inventory.unit_media (unit_id, sort_order);
