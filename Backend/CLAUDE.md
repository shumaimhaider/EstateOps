# EstateOps back end: business logic it enforces

Common domain: `/CLAUDE.md`. This file lists the business logic the back end enforces and how the
business is split across services. Design and diagrams: `docs/architecture.md`.

## Services and what each is responsible for

- **identity**: tenants, staff accounts, roles, permissions, sign-in and sessions.
- **inventory**: projects and their structure, units, unit status, unit pictures.
- **customer**: buyers and their combined money position.
- **sales**: payment plans and bookings, and the booking journey from request to completion.
- **billing**: invoices, payments, fines, escalations, collection figures and settings.
- **contract**: contracts and their versions per booking.
- **api-gateway**: the single entry that checks identity and routes work to the right service.

## The booking journey (one business process across services)

1. Sales receives a booking request for an available unit, a customer and a plan, and fixes the price
   at the unit's list price.
2. Inventory reserves the unit. If it is no longer available the booking is cancelled with a reason.
3. Sales confirms the booking. Billing creates the whole schedule (down payment, monthly
   installments) with invoice numbers.
4. Sales marks the booking active when the schedule exists.
5. Every payment, adjustment or overdue change updates the booking and customer figures.
6. When everything is paid the booking completes and the unit becomes sold.
7. A booking cancelled before any payment frees the unit, cancels open invoices and voids open
   contracts.
   Steps settle within seconds. Until they do, a screen can show the previous state.

## Identity rules

- Sign-in needs email and password, then a verification code. Failed attempts are recorded.
- A session lasts 15 minutes and is renewed with a refresh token that can be used once. Signing out
  ends the refresh token.
- Role changes reach a person when their session is next renewed.
- Only admin and owner can manage permissions. Owner and admin always keep every permission.
- A tenant always has at least one owner. An email is unique within a tenant.
- New tenants get the default permissions for every role and an owner account.

## Inventory rules

- Unit number is unique within a project (case-insensitive). Area is above zero. Price is zero or
  more, in the tenant currency.
- Staff may block, unblock, hold and release. Booked and sold come only from the sales journey.
- A unit that has ever been booked cannot be deleted. A project with units cannot be deleted.
- Every unit status change is recorded with who and when.
- Pictures are not allowed on plots.

## Customer rules

- Email is unique per tenant. ID numbers are stored and shown masked.
- A customer with bookings cannot be deleted.
- Totals (bookings, total value, received, pending, overdue, escalated) are sums over the customer's
  bookings.

## Sales rules

- A plan has a name (unique), a down payment percentage from 0 to 100 and 1 to 120 installments.
  A plan in use cannot be deleted.
- One live booking per unit. Price is a snapshot and does not change if the list price changes.
- Cancel is refused once any payment exists. Completed and cancelled bookings are final.

## Billing rules

- Schedule: down payment due on the booking date, monthly installments after it, day of month capped
  at 28, last installment takes the rounding. Invoice numbers run per tenant without gaps or repeats.
- Daily sweep: unpaid invoices past the due date become due, past the grace days (default 5) become
  overdue. Paid, waived, rescheduled and cancelled invoices are never touched.
- Payment by hand: method cash, bank transfer, online or cheque; amount above zero and not above the
  balance; received date not in the future; reference unique per tenant when given; part payments
  allowed; a receipt number is issued when the invoice is fully paid.
- Adjusting the amount: only with the adjust permission; new amount above what is already paid;
  a reason of at least 3 characters; original amount, new amount and reason are kept.
- Card payment: an intent is created for an amount up to the balance; the payment is recorded only
  after the provider confirms it; recording the same intent again changes nothing; if the balance
  dropped below the charged amount the record is refused.
- Two people cannot pay the same invoice at once: the second sees the new balance.
- Fines: one rate per level and category; the default (all categories) cannot be removed; a single
  property cannot have a category rate; percentage 0 to 100% with two decimals, fixed amount zero or
  more; changing a rate re-prices unpaid overdue invoices only.
- Escalation: 3 or more overdue installments on a booking (the threshold is a tenant setting); one
  notice per case; the case disappears when the overdue count drops below the threshold.
- Collection figures are sums of the invoices, so register and dashboard always agree.

## Contract rules

- Signed upload: PDF only, up to 10 MB; refused if the booking already has a signed contract;
  voids any PandaDoc contract still open.
- PandaDoc: template must be one of sale agreement or payment plan addendum; refused if a contract
  is signed or already open. Send moves draft to sent. Opened, signed and declined are signer events.
- Revise: only draft, sent, viewed or declined; needs a note; voids the version and creates the next
  draft. Signed PandaDoc contracts are final; a signed upload can be voided and replaced.
- Version numbers per booking only go up.

## Permissions the back end checks

see dashboard, see collection stats, see escalated cases, see projects, see units, see sales and
invoices, see customers, mark payments received, take card payments, adjust an invoice amount, see
contracts, manage contracts, see fine rates, change fine rates, manage roles and permissions. A
request without the permission is refused, whatever the screen shows.

## Business constraints

- Everything is scoped to the signed-in tenant. A tenant never sees another tenant's data, even by id.
- Money is whole minor units. Totals are always sums of underlying rows.
- Writes can be retried safely. The same request repeated returns the same result without repeating
  its effect.
- Every state change leaves an audit entry that is never edited or deleted.
- Lists are paged with cursors and stay stable while data changes.

## Not live yet

Card provider, e-signature provider and file storage are replaced by built-in stand-ins that behave
like the real ones. Real providers, Google sign-in, email and SMS are not connected.
