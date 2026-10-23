# EstateOps Management Portal: business domain

The staff portal of a property developer. Staff sell and track properties, collect installments, and run the
customer relationship. This file lists the business domain only, as it works in the code today.

## Tenants

- A tenant is one developer. Each has its own currency, locale, time zone and area unit (marla, kanal, sq ft, sq yd, sq m).
  Seeded: Zameen Developers (PKR, marla) and Desert Rose Properties (AED, sq ft).
- Nothing crosses tenants: projects, units, customers, bookings, invoices, fine rates, permissions and contracts are all per tenant.
- Money is always a whole number of minor units plus a currency. No fractions, no floats.

## Inventory

- Project (plot society, tower, or mixed) contains phases, blocks and floors, which contain units.
- Unit categories: plot, flat, villa, shop. A unit has an area, a list price, facing, view, corner, parking and bedrooms.
- Unit number is unique within its project. Price must be in the tenant currency. Pictures exist for flats, shops and villas, never plots.
- Unit status: available, held, booked, sold, blocked.
  - In the portal, staff can block an available unit and unblock a blocked one.
  - Hold, booking and sale are driven by the sales flow, not by staff buttons: a unit becomes sold only when its booking is fully paid.

## Customers and sales

- A customer (buyer) has contact details, a city and a preferred language, and may own several properties. ID numbers are always masked.
- A booking ties one customer to one unit under a payment plan: 20% down + 12 monthly, 25% + 24, or 30% + 36.
- A booking's money position (total, received, pending, overdue, next due date) is summed from its invoices, so every screen agrees.
- A booking completes automatically when every active invoice is paid, and its unit becomes sold.

## Invoices (installments)

- A plan is a down payment due on the booking date plus equal monthly installments (the last absorbs rounding).
- Invoice status: scheduled, due, paid, overdue, waived, rescheduled, cancelled.
  - Due or overdue starts after the due date; overdue after a 5 day grace.
  - Waived, rescheduled and cancelled invoices are inactive: they leave pending and overdue totals.
- Balance is amount minus paid. An invoice can be part paid.
- Whether an invoice can be paid, and how, comes from the server's allowed actions for the user's role. The portal never works it out itself.

## Taking payment

Staff take payment on the customer's behalf from an invoice or a customer page, by hand or by card.

- Mark as received (by hand): cash, bank transfer, online or cheque. Full or part payment. The money can be backdated with a received
  date, never a future one. A payment reference is optional but unique within the tenant.
- Pay by card (Stripe): the card is confirmed with Stripe directly, then the payment is verified and recorded. Card details never reach
  EstateOps. A card payment is recorded once, even if replayed. If the invoice balance changed between charge and recording, it is
  rejected for refund. A declined card leaves the invoice untouched. With the stand-in Stripe server, test cards: 4242 4242 4242 4242 pays, 4000 0000 0000 0002 is
  declined, 4000 0000 0000 9995 has insufficient funds.
- Adjusting the invoice amount at payment time (needs permission): a new amount above what is already paid, with a reason. The original
  amount, the new amount and the reason are kept and shown, and the change is audited. For card payments the adjustment applies only
  when the charge succeeds.
- A payment cannot exceed the (adjusted) balance. Paying the whole balance marks the invoice paid and issues a receipt number.
- Every payment is kept in a ledger with its source (manual or Stripe), method, reference, received date and who recorded it.

## Fine rates (late fines)

- A fine is charged per overdue installment, either a percentage of the installment amount or a fixed amount.
- Rates can be set at five levels. The most specific one wins: customer + category, customer, property (unit), project + category,
  project, default + category, default. Category means plot, flat, villa or shop, so shops and home plots can differ in the same
  project or for the same customer. A single property has one category, so it takes one rate.
- A default rate always exists (2% to start) and cannot be removed. Every other rate can be removed, and the level then inherits again.
- Setting or removing a rate recalculates the fine on every unpaid overdue invoice. Fines already on paid invoices stay as charged.
- The portal shows the rate that applies at each level, whether it is inherited and from where.

## Escalations

- A booking with 3 or more overdue installments is an escalated case, worst first (days late, then overdue amount).
- One notice letter can be sent per case. Paying down the overdue installments resolves the case.

## Contracts

- A booking can hold several contract versions. Two kinds:
  - Signed upload: the paper-signed PDF (PDF only, up to 10 MB). It is signed from the start.
  - PandaDoc: drafted from a template (sale agreement, payment plan addendum) with the buyer as signer, then sent for signing.
- PandaDoc status: draft, sent, viewed, signed, declined, voided. Opened, signed and declined come from the signer, not from staff.
- Rules:
  - Only one unsigned PandaDoc contract is open per booking.
  - Once a booking has a signed contract, no new contract can start. A signed PandaDoc contract is final.
  - Uploading a signed copy voids any PandaDoc contract still open.
  - A wrongly uploaded signed PDF can be voided and replaced.
  - Revising an open or declined PandaDoc contract needs a note saying what changes. It voids that version and opens the next as a draft.
  - Every completed sale already has a signed sale agreement.

## Roles and permissions

- Roles: owner, admin, sales manager, sales agent, finance, inventory manager, dealer manager, support, marketing, auditor.
- The admin decides what each role can see and do, in the roles and permissions module (admin only). Owner and admin always hold
  everything and cannot be edited, so the team cannot be locked out.
- Permissions: see dashboard, collection stats, escalated cases, projects, units, sales and invoices, customers; mark payments
  received; take card payments; adjust an invoice amount; see contracts; manage contracts; see fine rates; change fine rates; manage
  roles and permissions.
- The menu shows only modules the role holds. A page the role lacks shows a no-access message. Buttons follow the server's allowed actions.
- Starting points: finance records and charges payments, adjusts amounts and manages fines. Sales manager marks payments and manages
  contracts. Sales agent, support and auditor can look. Inventory, dealer and marketing see their own areas.

## Audit and safety

- Every state change (payments, adjustments, fine rate and role changes, unit actions, notices, contracts) is written to an append-only audit log with who, what, before and after.
- Every write can be retried safely: repeating the same action does not repeat its effect.

## Not real yet

- Stripe: use Stripe's own form (publishable key from the API). A stand-in Stripe server and form exist for tests and demos (VITE_STRIPE_UI=stand_in).
- PandaDoc: documents, sending and signing events are simulated. Opening a document links to PandaDoc's address format only.
- Fine rates, permissions and contracts use REST only (no GraphQL).
- Permissions hide menus, pages and actions in the portal; the back end enforces them on every request.
