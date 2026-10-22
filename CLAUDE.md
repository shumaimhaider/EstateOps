# EstateOps: common business domain

EstateOps runs a property developer's sales and collections. Staff sell and track properties,
collect installments and manage the customer relationship. This file is the business domain shared
by every app: the management portal, the customer portal and the back end. App-specific files
(`Backend/CLAUDE.md`, `EstateOpsManagementPortalUI/CLAUDE.md`) add only what is specific to them.

## Tenants
- A tenant is one developer. Each has its own currency, locale, time zone and area unit (marla,
  kanal, sq ft, sq yd, sq m). Seeded examples: Zameen Developers (PKR, marla) and Desert Rose
  Properties (AED, sq ft).
- Nothing crosses tenants: projects, units, customers, bookings, invoices, payments, fine rates,
  roles, permissions and contracts are all per tenant.
- Money is always a whole number of minor units plus a currency. No fractions, no floats.

## Inventory
- A project (plot society, tower, or mixed) contains phases, blocks and floors, which contain units.
- Unit categories: plot, flat, villa, shop. A unit has an area, a list price, facing, view, corner,
  parking and bedrooms.
- The unit number is unique within its project. The price is in the tenant currency. Pictures exist
  for flats, shops and villas, never plots.
- Unit status: available, held, booked, sold, blocked.
  - Staff can block an available unit and unblock a blocked one; a held unit can be released.
  - Booking and sale are driven by the sales flow, never by a staff button. A unit becomes sold only
    when its booking is fully paid, and returns to available if the booking is cancelled.

## Customers and sales
- A customer (buyer) has contact details, a city and a preferred language, and may own several
  properties. ID numbers are always masked when shown.
- A payment plan is a named schedule: a down payment percentage plus a number of monthly
  installments (for example 20% down + 12 monthly, 25% + 24, 30% + 36).
- A booking ties one customer to one unit under one plan, at the unit's list price at that moment.
  Booking status: requested, confirmed, active, completed, cancelled.
- A unit can have only one live booking. A booking can be cancelled only before any payment is made.
- A booking completes automatically when every active invoice is paid, and its unit becomes sold.
- A booking's money position (total, received, pending, overdue, next due date) and a customer's
  position across all their properties are always sums of the invoices underneath.

## Invoices (installments)
- The schedule is a down payment due on the booking date plus equal monthly installments. The day of
  month is capped at 28, and the last installment absorbs rounding.
- Invoice status: scheduled, due, paid, overdue, waived, rescheduled, cancelled.
  - After the due date an unpaid invoice is due; after a 5 day grace it is overdue.
  - Waived, rescheduled and cancelled invoices are inactive and leave pending and overdue totals.
- Balance is amount minus paid. An invoice can be part paid.
- Whether an invoice can be paid, and how, depends on its state and the user's permissions. The apps
  show only the actions the server allows.

## Taking payment
Staff take payment on the customer's behalf, by hand or by card.
- Mark as received (by hand): cash, bank transfer, online or cheque. Full or part payment. The
  received date can be earlier but never in the future. A payment reference is optional and unique
  within the tenant.
- Pay by card (Stripe): the card is confirmed with the card provider directly, then the payment is
  verified and recorded. Card details never reach EstateOps. A card payment is recorded once even if
  repeated. If the balance changed between charge and recording it is rejected for refund. A declined
  card leaves the invoice untouched.
- Adjusting the invoice amount at payment time (needs permission): a new amount above what is already
  paid, with a reason. The original amount, new amount and reason are kept and shown, and the change
  is audited. For card payments it applies only when the charge succeeds.
- A payment cannot exceed the (adjusted) balance. Paying the whole balance marks the invoice paid and
  issues a receipt number.
- Every payment is kept in a ledger with source (manual or card), method, reference, received date
  and who recorded it.

## Fine rates (late fines)
- A fine is charged per overdue installment, as a percentage of the installment amount or a fixed
  amount.
- Rates can be set per category (plot, flat, villa, shop) at the default, project and customer
  levels, and per single property. The most specific wins: customer + category, customer, property,
  project + category, project, default + category, default.
- A default rate always exists (2% to start) and cannot be removed. Every other rate can be removed
  and the level then inherits again. A single property has one category, so it takes one rate.
- Changing a rate re-prices fines on unpaid overdue invoices. Fines already on paid invoices stay as
  charged.

## Escalations
- A booking with 3 or more overdue installments is an escalated case, worst first (days late, then
  overdue amount).
- One notice letter can be sent per case. Paying down the overdue installments resolves the case.

## Contracts
- A booking can hold several contract versions. Two kinds: a signed upload (the paper-signed PDF, up
  to 10 MB, signed from the start) and a PandaDoc contract drafted from a template (sale agreement,
  payment plan addendum) with the buyer as signer.
- PandaDoc status: draft, sent, viewed, signed, declined, voided. Opened, signed and declined come
  from the signer, not from staff.
- Only one unsigned PandaDoc contract is open per booking. Once a booking has a signed contract no new
  one can start, and a signed PandaDoc contract is final.
- Uploading a signed copy voids any PandaDoc contract still open. A wrongly uploaded signed PDF can be
  voided and replaced.
- Revising an open or declined PandaDoc contract needs a note saying what changes; it voids that
  version and opens the next as a draft.

## Roles and permissions
- Roles: owner, admin, sales manager, sales agent, finance, inventory manager, dealer manager,
  support, marketing, auditor.
- The admin decides what each role can see and do (admin only). Owner and admin always hold
  everything and cannot be edited, so a tenant cannot lock itself out.
- Permissions: see dashboard, collection stats, escalated cases, projects, units, sales and invoices,
  customers; mark payments received; take card payments; adjust an invoice amount; see contracts;
  manage contracts; see fine rates; change fine rates; manage roles and permissions.
- Menus, pages and actions follow the role. Starting points: finance records and charges payments,
  adjusts amounts and manages fines; sales manager marks payments and manages contracts; sales agent,
  support and auditor can look; inventory, dealer and marketing see their own areas.

## Audit and safety
- Every state change (payments, adjustments, fine rate and role changes, unit actions, notices,
  contracts, bookings) is written to an append-only audit log with who, what, before and after.
- Every write can be retried safely: repeating the same action does not repeat its effect.

## Who owns what
| Business capability | Owner |
|---|---|
| Sign-in, users, roles, permissions, tenant settings | identity service |
| Projects, units, unit status, pictures | inventory service |
| Customers | customer service |
| Payment plans, bookings | sales service |
| Invoices, payments, fines, escalations, collection stats | billing service |
| Contracts | contract service |
| Staff screens | management portal; buyer screens: customer portal |
