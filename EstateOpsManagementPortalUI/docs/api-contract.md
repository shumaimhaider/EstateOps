# Admin API contract (front-end view)

Wire shapes are declared once, in `src/shared/api/dtos/<name>.dto.js`, with the mapper beside
them. This file summarises them for back-end developers. If a field changes, update the DTO,
its mapper, the GraphQL fragment (`features/*/data/transport/*.fragments.js`), the back-end
DTO and this file, and nothing else.

## Conventions

- Base path `/api/v1/admin`. JSON, snake_case. Ids are UUIDs. Dates are ISO-8601 UTC.
- Money is an integer in minor units plus `currency` (ISO 4217). Never a float.
- Every write sends `Idempotency-Key`; replaying a key returns the first response.
- Cursor pagination: `?cursor=&limit=` returns `{ "data": [...], "next_cursor": "..." | null }`.
  GraphQL returns a Relay connection `{ edges { cursor node }, pageInfo { endCursor hasNextPage } }`.
  Both normalise to `{ items, nextCursor }` in `page.dto.js`.
- Errors (REST): `{ "code", "message", "details": [{ "field", "message" }] }`.
  Errors (GraphQL): `errors[].extensions = { code, status, details }`. Both become one `ApiError`.
- Records that have a state machine include `allowed_actions: string[]`; the UI renders only those.

## Units — `unit.dto.js`

| Field                              | Type                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| id, tenant_id, project_id          | uuid                                                    |
| project_name                       | string                                                  |
| phase_id, block_id, floor_id       | uuid or null                                            |
| block_name, floor_label            | string or null                                          |
| unit_no                            | string, unique per project                              |
| kind                               | `plot` `flat` `villa` `shop`                            |
| area_value, area_unit              | number > 0; `marla` `kanal` `sq_ft` `sq_yd` `sq_m`      |
| bedrooms, facing, view             | int or null, string or null, string or null             |
| corner, parking                    | boolean, int                                            |
| attributes, geometry               | object, object or null                                  |
| status                             | `available` `held` `booked` `sold` `blocked`            |
| list_price, currency               | int minor units, ISO code                               |
| allowed_actions                    | string[]                                                |
| status_history (detail only)       | `[{ status, changed_by, changed_by_name, changed_at }]` |
| created_at, updated_at, created_by | ISO date, ISO date, uuid or null                        |

Endpoints: `GET /units` (`q, status, kind, project_id, sort=field:dir, cursor, limit`),
`GET /units/{id}`, `POST /units`, `POST /units/{id}/block`, `POST /units/{id}/unblock`.
GraphQL: `Units`, `Unit`, `CreateUnit`, `BlockUnit`, `UnblockUnit`.
Validation failures: `422 VALIDATION_ERROR` with `details`. Illegal transitions: `409 INVALID_TRANSITION`.

## Projects — `project.dto.js`

`id, tenant_id, name, location, kind (plot_society|tower|mixed), allowed_actions, created_at, updated_at, created_by`.
Endpoint: `GET /projects`. GraphQL: `Projects`.

## Auth — `auth.dto.js`

`POST /auth/login {email,password}` -> `{status:'mfa_required', mfa_token}`; `POST /auth/2fa {mfa_token, code}` and
`POST /auth/google {id_token}` -> `{access_token, refresh_token, user}`; `POST /auth/refresh {refresh_token}`;
`GET /auth/me`; `POST /auth/logout`. Mock only: `GET /auth/dev-accounts`. Mock credentials: any seeded email,
password `Passw0rd!`, 2FA `123456`; Google id token `mock-google:<email>`.

## Sales and collections

- `booking.dto.js` — `GET /bookings`, `GET /bookings/{id}`. Server computes installments_total/paid/due/overdue/upcoming,
  received_amount, pending_amount, overdue_amount, fine_amount, next_due_date, escalated.
- `installment.dto.js` (scheduled invoices) — `GET /installments`, `POST /installments/{id}/pay {method, amount?, reference?}`
  (full or part payment; 422 field errors; 409 on illegal transition).
- `escalation.dto.js` — `GET /escalations` (bookings with >= N overdue installments, default 3),
  `POST /escalations/{id}/notice`.
- `stats.dto.js` — `GET /stats/collections?project_id=` returns pre-aggregated summary, by_month, ageing,
  units_by_kind and by_project. Every figure is summed from the same installment rows as the register.
- `customer.dto.js` — `GET /customers`, `GET /customers/{id}`; ID numbers are masked by the server.
- `project.dto.js` — adds `units_total`, `unit_counts`; `GET /projects/{id}` and `GET /projects/{id}/map` (site plan shapes).
- `unit.dto.js` — adds `booking_id` and (detail only) `media` (flats, shops and villas; never plots).

## Payments — `installment.dto.js`

Invoices add `original_amount`, `adjustment_reason`, `payment_source` (`manual` | `stripe`), `received_on`.
`allowed_actions` is filtered by the caller's permissions: `record_payment` (mark received by hand),
`pay_by_card`, `adjust_amount`.

- `POST /installments/{id}/pay` marks a payment received by hand. Body `{ method (cash|bank_transfer|online|cheque),
amount?, reference?, received_on? (not in the future), note?, adjusted_amount?, adjustment_reason? }`.
  `adjusted_amount` first changes the invoice amount (needs `invoices.adjust`, a reason, and a value above what is paid).
- `POST /installments/{id}/payment-intents` starts a card payment. Body `{ amount?, adjusted_amount?, adjustment_reason? }`
  -> `{ payment_intent_id, client_secret, amount, currency, status }`. The adjustment is applied only once the payment is recorded.
- The browser confirms the card **directly with Stripe** using the client secret. Card data never goes to this API.
- `POST /installments/{id}/card-payments { payment_intent_id }` verifies the intent with Stripe and records the payment
  (`409 PAYMENT_NOT_COMPLETED` if Stripe has not confirmed it, `409 BALANCE_CHANGED` if the balance moved). Replaying the same
  intent returns the invoice without charging again. A `payment_intent.succeeded` webhook should record it too.

## Fine rates — `fineRule.dto.js`

`id, tenant_id, scope (default|project|unit|customer), scope_id, scope_name, unit_kind (plot|flat|villa|shop|null),
kind (percent|fixed), value, currency, allowed_actions, updated_at, updated_by_name`.
`value` is basis points for `percent` (200 = 2%) and minor units for `fixed`. `unit_kind` is allowed on default, project and
customer rules, not on `unit` rules.
Most specific wins: customer+kind, customer, unit, project+kind, project, default+kind, default.

- `GET /fine-rules` (needs `fines.view`), `PUT /fine-rules` (create or replace one rate, needs `fines.manage`),
  `DELETE /fine-rules/{id}` (`409 DEFAULT_RULE_REQUIRED` for the all-category default).
- `GET /fine-rules/effective?scope=&scope_id=&unit_kind=` -> `{ rule, inherited, scope, scope_id, unit_kind, allowed_actions }`.
- Saving or deleting a rate recalculates `fine_amount` on every unpaid overdue invoice of the tenant.

## Permissions — `permission.dto.js`

`GET /permissions` (needs `permissions.manage`) -> `{ catalog: [{ key, group }], roles: [{ role, permissions, locked }] }`.
`PUT /permissions/{role} { permissions }`. `owner` and `admin` are locked (`409 ROLE_LOCKED`). The signed-in user DTO
(`/auth/me`, sign-in) carries `permissions: string[]`.

## Contracts — `contract.dto.js`

`id, booking_id, kind (signed_upload|pandadoc), title, template, status (draft|sent|viewed|signed|declined|voided), version,
supersedes_id, revision_note, file_name, file_size, pandadoc_document_id, pandadoc_url, signer_email, sent_at, signed_at,
allowed_actions, created_by_name`.

- `GET /contracts?booking_id=` (needs `contracts.view`), newest version first.
- `POST /bookings/{id}/contracts/signed` multipart `file` (PDF, up to 10 MB) and optional `title`. `409 CONTRACT_ALREADY_SIGNED`.
  Voids any PandaDoc contract still open for the booking.
- `POST /bookings/{id}/contracts/pandadoc { template }` (`409 CONTRACT_OPEN` / `CONTRACT_ALREADY_SIGNED`).
- `POST /contracts/{id}/send`, `/void`, `/revise { note }` (revise voids the version and returns the next draft).
- Mock only: `POST /mock/contracts/{id}/events/{viewed|signed|declined}` stands in for PandaDoc webhooks.
