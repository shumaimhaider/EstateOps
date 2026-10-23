-- =============================================================================================
-- "Contact support" from the customer portal. A request is a short thread between one customer
-- and the developer's staff: the customer opens it (optionally about one of their properties),
-- staff reply, either side can add messages, and staff close it.
-- =============================================================================================
CREATE TABLE IF NOT EXISTS customer.support_request (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  customer_id     uuid        NOT NULL REFERENCES customer.customer (id) ON DELETE CASCADE,
  booking_id      uuid,
  subject         text        NOT NULL CONSTRAINT support_subject_chk CHECK (length(subject) BETWEEN 1 AND 120),
  status          text        NOT NULL DEFAULT 'open' CONSTRAINT support_status_chk CHECK (status IN ('open', 'answered', 'closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX IF NOT EXISTS support_customer_idx ON customer.support_request (tenant_id, customer_id, last_message_at DESC, id);
CREATE INDEX IF NOT EXISTS support_queue_idx ON customer.support_request (tenant_id, status, last_message_at DESC, id);

CREATE TABLE IF NOT EXISTS customer.support_message (
  id          uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  request_id  uuid        NOT NULL REFERENCES customer.support_request (id) ON DELETE CASCADE,
  author_kind text        NOT NULL CONSTRAINT support_author_chk CHECK (author_kind IN ('customer', 'staff')),
  author_name text        NOT NULL,
  body        text        NOT NULL CONSTRAINT support_body_chk CHECK (length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_message_idx ON customer.support_message (request_id, created_at, id);
