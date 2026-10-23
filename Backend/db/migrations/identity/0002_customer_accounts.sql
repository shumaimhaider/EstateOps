-- =============================================================================================
-- Customer sign-in for the customer portal. A customer account is created from the customer
-- the management portal made (customer.upserted), invited by email to choose a password, and
-- signs in with email and password. Staff and customers never share a table or a token kind.
-- =============================================================================================
CREATE TABLE IF NOT EXISTS identity.customer_account (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES identity.tenant (id) ON DELETE RESTRICT,
  customer_id         uuid        NOT NULL,
  email               text        NOT NULL CONSTRAINT customer_account_email_chk CHECK (email = lower(email) AND email <> ''),
  full_name           text        NOT NULL,
  password_hash       text,
  status              text        NOT NULL DEFAULT 'invited'
                      CONSTRAINT customer_account_status_chk CHECK (status IN ('invited', 'active', 'disabled')),
  invited_at          timestamptz,
  last_login_at       timestamptz,
  password_changed_at timestamptz,
  source_at           timestamptz NOT NULL DEFAULT '-infinity',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- an invited account has no password yet; an active one always has
  CONSTRAINT customer_account_password_chk CHECK (status <> 'active' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_account_customer_uq ON identity.customer_account (tenant_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_account_email_uq ON identity.customer_account (tenant_id, email);

-- One-time links: choose a password (invite) or reset a forgotten one. Only the hash is stored.
CREATE TABLE IF NOT EXISTS identity.account_token (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  account_id uuid        NOT NULL REFERENCES identity.customer_account (id) ON DELETE CASCADE,
  purpose    text        NOT NULL CONSTRAINT account_token_purpose_chk CHECK (purpose IN ('invite', 'reset')),
  token_hash text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_token_hash_uq ON identity.account_token (token_hash);
CREATE INDEX IF NOT EXISTS account_token_account_idx ON identity.account_token (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS identity.customer_refresh_token (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  account_id uuid        NOT NULL REFERENCES identity.customer_account (id) ON DELETE CASCADE,
  token_hash text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_refresh_hash_uq ON identity.customer_refresh_token (token_hash);
CREATE INDEX IF NOT EXISTS customer_refresh_account_idx ON identity.customer_refresh_token (account_id);

CREATE TABLE IF NOT EXISTS identity.customer_login_history (
  id         uuid PRIMARY KEY,
  tenant_id  uuid        NOT NULL,
  account_id uuid        NOT NULL REFERENCES identity.customer_account (id) ON DELETE CASCADE,
  event      text        NOT NULL CONSTRAINT customer_login_event_chk CHECK (event IN ('login', 'login_failed', 'password_set', 'password_changed', 'reset_requested')),
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_login_account_idx ON identity.customer_login_history (account_id, created_at DESC);
