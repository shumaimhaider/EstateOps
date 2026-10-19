---
paths:
  - "Backend/**"
---

# Backend rules

These apply to every edit under `Backend/`, regardless of what you're doing.

## Tenant isolation
- Every query goes through the tenant-scoped repository in `packages/database`. Never use a raw entity manager/repository that isn't tenant-filtered.
- Never accept `tenantId` from the request body — it comes only from the JWT claim resolved by `api-gateway`.

## Service boundaries
- A service only reads/writes its own database. Cross-service data access goes through the service's public API or an event in `packages/messaging`, never a direct DB join or shared table.
- Shared shapes (DTOs, event payloads, enums) live in `packages/types` — don't redefine them locally in a service.

## Money and dates
- Money is always an integer minor-unit value (fils/cents) with an explicit currency code — never a float.
- Dates that represent a business day (due date, booking date) are stored as date-only (no time component) in the tenant's configured timezone, not UTC-shifted.
- Any arithmetic on money or dates goes through the shared helpers in `packages/types` — don't hand-roll rounding or date math.

## Auth
- Every endpoint declares its required permission via the decorators in `packages/auth`. No endpoint is "open by omission" — if a permission isn't set, that's a bug.
- 401 means no/invalid token; 403 means valid token, wrong permission. Don't collapse the two.

## Idempotency
- Any endpoint that triggers a side effect with external cost (payment capture, commission payout, notification send) must accept an idempotency key and be safe to retry.
