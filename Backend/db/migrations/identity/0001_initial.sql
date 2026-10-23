-- =============================================================================================
-- identity service database. Owns schema "identity" and nothing else: no table here references another
-- service's tables. Cross-service knowledge arrives as events into local *_ref tables.
-- Migration 0001: the initial schema. Applied by `npm run db:migrate`, which wraps it in a transaction.
-- Never edit a migration that has been applied anywhere: add a new numbered file instead.
-- =============================================================================================
CREATE SCHEMA IF NOT EXISTS identity;
SELECT public.estateops_install_service_tables('identity');

-- =============================================================================================
-- identity: tenants, staff accounts, roles, permissions, sessions
-- =============================================================================================
CREATE TABLE IF NOT EXISTS identity.tenant (
  id         uuid PRIMARY KEY,
  slug       text        NOT NULL CONSTRAINT tenant_slug_chk CHECK (slug ~ '^[a-z][a-z0-9]{1,23}$'),
  name       text        NOT NULL,
  currency   char(3)     NOT NULL,
  locale     text        NOT NULL,
  time_zone  text        NOT NULL,
  area_unit  text        NOT NULL CONSTRAINT tenant_area_unit_chk CHECK (area_unit IN ('marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int         NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_slug_uq ON identity.tenant (lower(slug));

-- Permission catalogue (reference data, upserted at the bottom of this file).
CREATE TABLE IF NOT EXISTS identity.permission (
  key        text PRIMARY KEY,
  grp        text NOT NULL,
  sort_order int  NOT NULL
);

CREATE TABLE IF NOT EXISTS identity.app_user (
  id            uuid PRIMARY KEY,
  tenant_id     uuid        NOT NULL REFERENCES identity.tenant (id) ON DELETE RESTRICT,
  email         text        NOT NULL,
  name          text        NOT NULL,
  role          text        NOT NULL CONSTRAINT app_user_role_chk CHECK (role IN
                  ('owner', 'admin', 'sales_manager', 'sales_agent', 'finance', 'inventory_manager',
                   'dealer_manager', 'support', 'marketing', 'auditor')),
  password_hash text        NOT NULL,
  totp_secret   text        NOT NULL,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       int         NOT NULL DEFAULT 1
);
-- Sign-in is by email alone, so an email belongs to exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_uq ON identity.app_user (lower(email));
CREATE INDEX IF NOT EXISTS app_user_tenant_idx ON identity.app_user (tenant_id, role);

CREATE TABLE IF NOT EXISTS identity.role_permission (
  tenant_id      uuid NOT NULL REFERENCES identity.tenant (id) ON DELETE RESTRICT,
  role           text NOT NULL CONSTRAINT role_permission_role_chk CHECK (role IN
                   ('owner', 'admin', 'sales_manager', 'sales_agent', 'finance', 'inventory_manager',
                    'dealer_manager', 'support', 'marketing', 'auditor')),
  permission_key text NOT NULL REFERENCES identity.permission (key) ON DELETE RESTRICT,
  PRIMARY KEY (tenant_id, role, permission_key)
);

-- Short-lived step between password and verification code.
CREATE TABLE IF NOT EXISTS identity.mfa_challenge (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES identity.app_user (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_challenge_user_idx ON identity.mfa_challenge (user_id);

CREATE TABLE IF NOT EXISTS identity.refresh_token (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES identity.app_user (id) ON DELETE CASCADE,
  token_hash text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_token_hash_uq ON identity.refresh_token (token_hash);
CREATE INDEX IF NOT EXISTS refresh_token_user_idx ON identity.refresh_token (user_id);

CREATE TABLE IF NOT EXISTS identity.login_history (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES identity.app_user (id) ON DELETE CASCADE,
  method     text        NOT NULL CONSTRAINT login_method_chk CHECK (method IN ('password', '2fa')),
  success    boolean     NOT NULL,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_history_user_idx ON identity.login_history (tenant_id, user_id, created_at DESC);


-- =============================================================================================
-- Reference data: the permission catalogue
-- =============================================================================================
INSERT INTO identity.permission (key, grp, sort_order) VALUES
  ('dashboard.view',     'overview',    1),
  ('stats.view',         'insights',    2),
  ('escalations.view',   'insights',    3),
  ('projects.view',      'inventory',   4),
  ('units.view',         'inventory',   5),
  ('inventory.manage',   'inventory',   6),
  ('sales.view',         'sales',       7),
  ('customers.view',     'sales',       8),
  ('sales.manage',       'sales',       9),
  ('customers.manage',   'sales',       10),
  ('payments.record',    'collections', 11),
  ('payments.card',      'collections', 12),
  ('invoices.adjust',    'collections', 13),
  ('contracts.view',     'contracts',   14),
  ('contracts.manage',   'contracts',   15),
  ('fines.view',         'settings',    16),
  ('fines.manage',       'settings',    17),
  ('permissions.manage', 'settings',    18)
ON CONFLICT (key) DO UPDATE SET grp = EXCLUDED.grp, sort_order = EXCLUDED.sort_order;
