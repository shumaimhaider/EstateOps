---
name: backend-feature
description: Use when adding a new feature, endpoint, or business rule to a backend service (e.g. a new booking flow, a new payment plan type, a new commission rule). Walks through where things go across service, packages, migration, and events — not for test-only changes, use backend-tests for that.
paths:
  - "Backend/**"
---

# Adding a backend feature

1. **Find the owning service.** One of `api-gateway`, `auth-service`, `inventory-service`, `booking-service`, `payment-service`, `commission-service`, `document-service`, `notification-service`, `reporting-service`. If the feature touches two services, split it into one change per service connected by an event, not a direct call.

2. **Shared types first.** If the feature introduces a new DTO, event payload, or enum, add it to `packages/types` before writing the service code that uses it. Other services must consume the same shape, not a local copy.

3. **Migration.** Add the migration via the helper in `packages/database`. Never hand-edit a column type for money/date fields — follow the backend rule's minor-unit / date-only convention.

4. **Guard the endpoint.** Add the permission decorator from `packages/auth`. Decide 401 vs 403 deliberately.

5. **Side effects → events, not calls.** If the feature should notify another service (e.g. booking confirmed → notification-service), publish an event via `packages/messaging` using a name/payload already defined in `packages/types`, don't call the other service's HTTP endpoint directly.

6. **Idempotency.** If the endpoint has external-facing side effects (charges, payouts, sends), accept and honor an idempotency key per the backend rule.

7. **Tests ship with the feature**, not after. At minimum: tenant isolation (cross-tenant access is rejected), 401/403 paths, idempotent retry behavior, and money/date edge cases (zero, negative, rounding, month-end, leap year) if relevant. See `backend-testing.md` for the full checklist and coverage targets.

8. **Reporting impact.** If the feature changes collections/commission numbers, check whether `reporting-service` needs a corresponding update — it reads events, not other services' DBs.
