import {
  ConflictError,
  DEFAULT_ROLE_PERMISSIONS,
  NotFoundError,
  clampLimit,
  decodeCursor,
  encodeCursor,
  newId,
  parseSort,
} from '@estateops/kernel';
import {
  createCache,
  createMemoryClient,
  createMemoryMailer,
  silentLogger,
} from '@estateops/platform';
import { TEST_TENANT_A, createFakeUow, createTestAuth } from '@estateops/platform/testing';
import { composeBilling } from '../src/main/compose.js';
import { INSTALLMENT_SORT_FIELDS } from '../src/installments/application/ListInstallments.js';
import { createMockStripe, listen } from '@estateops/mock-providers';
import { createStripeGateway } from '../src/payments/infrastructure/StripeGateway.js';
import { outstanding } from '../src/installments/domain/invoice.js';
import { summarizeInvoices } from '../src/installments/domain/summary.js';
import { fineFor, resolveRule } from '../src/fines/domain/rule.js';
import { DEFAULT_SETTINGS } from '../src/settings/domain/settings.js';

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = (x) => (x ? structuredClone(x) : null);

/** In-memory billing repositories. They reuse the domain (summary, fine resolution), so the infrastructure tests can cross-check them against the SQL. */
export function makeBillingRepos(clock) {
  const s = {
    invoices: new Map(),
    payments: [],
    stripeCustomers: new Map(),
    methods: new Map(),
    checkouts: new Map(),
    transactions: new Map(),
    stripeEvents: new Map(),
    jobRuns: new Map(),
    attempts: new Map(),
    emails: new Map(),
    bookingRefs: new Map(),
    cancelled: new Set(),
    counters: new Map(),
    settings: new Map(),
    rules: [],
    notices: new Map(),
    tenantRefs: new Map(),
    projectRefs: new Map(),
    unitRefs: new Map(),
    customerRefs: new Map(),
  };
  const ofTenant = (t) => [...s.invoices.values()].filter((i) => i.tenantId === t);
  const ofBooking = (b) => [...s.invoices.values()].filter((i) => i.bookingId === b);
  const view = (i) => {
    const b = s.bookingRefs.get(i.bookingId);
    return {
      invoice: clone(i),
      unitNo: b.unitNo,
      projectName: b.projectName,
      buyerName: b.customerName,
      currency: b.currency,
    };
  };
  const settingsOf = (t) => s.settings.get(t) ?? { ...DEFAULT_SETTINGS };

  const escalationRow = (t, ref, threshold) => {
    const overdue = ofBooking(ref.bookingId).filter((i) => i.status === 'overdue');
    if (ref.status === 'cancelled' || overdue.length < threshold) return null;
    return {
      id: ref.bookingId,
      bookingId: ref.bookingId,
      unitId: ref.unitId,
      unitNo: ref.unitNo,
      unitKind: ref.unitKind,
      projectName: ref.projectName,
      customerId: ref.customerId,
      buyerName: ref.customerName,
      buyerPhone: ref.customerPhone,
      currency: ref.currency,
      missedInstallments: overdue.length,
      overdueAmount: overdue.reduce((a, i) => a + outstanding(i), 0),
      fineAmount: overdue.reduce((a, i) => a + i.fineAmount, 0),
      oldestDueDate: overdue.map((i) => i.dueDate).sort()[0],
      noticeSentAt: s.notices.get(ref.bookingId)?.sentAt ?? null,
      createdAt: new Date('2026-10-01T09:00:00Z'),
    };
  };

  return {
    stores: s,
    repos: {
      installments: {
        insertMany: async (list) =>
          list.forEach((i) =>
            s.invoices.set(i.id, { ...i, createdAt: clock.now(), updatedAt: clock.now() }),
          ),
        findById: async (t, id) =>
          s.invoices.get(id)?.tenantId === t ? clone(s.invoices.get(id)) : null,
        findView: async (t, id) =>
          s.invoices.get(id)?.tenantId === t ? view(s.invoices.get(id)) : null,
        update: async (i) => {
          const cur = s.invoices.get(i.id);
          if (!cur) throw new NotFoundError();
          if (cur.version !== i.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
          const saved = { ...cur, ...i, version: cur.version + 1, updatedAt: clock.now() };
          s.invoices.set(i.id, saved);
          return clone(saved);
        },
        list: async (t, f) => {
          const picked = parseSort(f.sort, INSTALLMENT_SORT_FIELDS, {
            field: 'due_date',
            dir: 'asc',
          });
          const key = {
            due_date: 'dueDate',
            amount: 'amount',
            balance: null,
            status: 'status',
            invoice_no: 'invoiceNo',
            seq: 'seq',
          }[picked.field];
          let rows = ofTenant(t).filter(
            (i) =>
              (!f.status || i.status === f.status) &&
              (!f.bookingId || i.bookingId === f.bookingId) &&
              (!f.customerId || i.customerId === f.customerId) &&
              (!f.projectId || i.projectId === f.projectId) &&
              (!f.unitKind || i.unitKind === f.unitKind) &&
              (!f.dueFrom || i.dueDate >= f.dueFrom) &&
              (!f.dueTo || i.dueDate <= f.dueTo),
          );
          if (f.q?.trim()) {
            rows = rows.filter((i) => {
              const b = s.bookingRefs.get(i.bookingId);
              return `${i.invoiceNo} ${b.unitNo} ${b.customerName} ${i.paymentReference ?? ''}`
                .toLowerCase()
                .includes(f.q.trim().toLowerCase());
            });
          }
          const val = (i) => (key ? i[key] : outstanding(i));
          rows.sort(
            (a, b) =>
              (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : a.id.localeCompare(b.id)) *
              (picked.dir === 'desc' ? -1 : 1),
          );
          const size = clampLimit(f.limit);
          const start = f.cursor ? decodeCursor(f.cursor).v : 0;
          return {
            items: rows.slice(start, start + size).map(view),
            nextCursor:
              start + size < rows.length ? encodeCursor({ v: start + size, id: 'o' }) : null,
          };
        },
        tenantsToSweep: async (today) => [
          ...new Set(
            [...s.invoices.values()]
              .filter((i) => ['scheduled', 'due'].includes(i.status) && i.dueDate < today)
              .map((i) => i.tenantId),
          ),
        ],
        sweepBatch: async (t, today, grace, limit) => {
          const addDays = (d, n) =>
            new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
          const moved = [];
          for (const i of ofTenant(t).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))) {
            if (
              moved.length >= limit ||
              !['scheduled', 'due'].includes(i.status) ||
              i.dueDate >= today
            )
              continue;
            const target = addDays(i.dueDate, grace) < today ? 'overdue' : 'due';
            if (target === i.status) continue;
            i.status = target;
            i.version += 1;
            moved.push({ id: i.id, bookingId: i.bookingId, status: target });
          }
          return moved;
        },
        hasPayments: async (t, bookingId) =>
          [...s.invoices.values()].some(
            (i) => i.tenantId === t && i.bookingId === bookingId && i.paidAmount > 0,
          ),
        cancelUnpaidOfBooking: async (t, bookingId) => {
          const list = ofBooking(bookingId).filter(
            (i) =>
              i.tenantId === t &&
              ['scheduled', 'due', 'overdue'].includes(i.status) &&
              i.paidAmount === 0,
          );
          list.forEach((i) => ((i.status = 'cancelled'), (i.version += 1)));
          return list.length;
        },
      },
      payments: {
        insert: async (p) => {
          if (s.payments.some((x) => x.tenantId === p.tenantId && x.reference === p.reference))
            throw new ConflictError('REFERENCE_TAKEN', 'taken');
          if (p.stripeIntentId && s.payments.some((x) => x.stripeIntentId === p.stripeIntentId))
            throw new ConflictError('PAYMENT_ALREADY_RECORDED', 'twice');
          s.payments.push({ ...p, createdAt: clock.now() });
        },
        referenceTaken: async (t, ref) =>
          s.payments.some((p) => p.tenantId === t && p.reference === ref),
        listForInvoice: async (t, id) =>
          s.payments.filter((p) => p.tenantId === t && p.installmentId === id).map(clone),
      },
      stripeCustomers: {
        find: async (t, c) => s.stripeCustomers.get(`${t}:${c}`) ?? null,
        save: async (t, c, id) => {
          if (!s.stripeCustomers.has(`${t}:${c}`)) s.stripeCustomers.set(`${t}:${c}`, id);
          return s.stripeCustomers.get(`${t}:${c}`);
        },
        customerOf: async (t, id) =>
          [...s.stripeCustomers].find(([k, v]) => k.startsWith(t) && v === id)?.[0].split(':')[1] ??
          null,
      },
      paymentMethods: {
        insert: async (m) => {
          if (
            m.fingerprint &&
            [...s.methods.values()].some(
              (x) =>
                x.tenantId === m.tenantId &&
                x.customerId === m.customerId &&
                x.fingerprint === m.fingerprint &&
                x.status === 'active',
            )
          )
            throw new ConflictError('CARD_ALREADY_SAVED', 'This card is already saved');
          s.methods.set(m.id, { ...m, createdAt: clock.now().toISOString() });
          return m;
        },
        findById: async (t, id) =>
          s.methods.get(id)?.tenantId === t ? clone(s.methods.get(id)) : null,
        findByStripeId: async (t, id) =>
          clone(
            [...s.methods.values()].find((m) => m.tenantId === t && m.stripePaymentMethodId === id),
          ),
        findActiveByFingerprint: async (t, c, fp) =>
          fp
            ? clone(
                [...s.methods.values()].find(
                  (m) =>
                    m.tenantId === t &&
                    m.customerId === c &&
                    m.fingerprint === fp &&
                    m.status === 'active',
                ),
              )
            : null,
        listForCustomer: async (t, c) =>
          [...s.methods.values()]
            .filter((m) => m.tenantId === t && m.customerId === c && m.status === 'active')
            .sort(
              (a, b) =>
                Number(b.isActive) - Number(a.isActive) || b.createdAt.localeCompare(a.createdAt),
            )
            .map(clone),
        findActive: async (t, c) =>
          clone(
            [...s.methods.values()].find(
              (m) => m.tenantId === t && m.customerId === c && m.isActive,
            ),
          ),
        setActive: async (t, c, id) => {
          for (const m of s.methods.values())
            if (m.tenantId === t && m.customerId === c) m.isActive = false;
          const target = s.methods.get(id);
          if (target?.status === 'active') target.isActive = true;
        },
        markRemoved: async (_t, id) =>
          Object.assign(s.methods.get(id), { status: 'removed', isActive: false }),
      },
      checkouts: {
        insert: async (c) =>
          void s.checkouts.set(c.id, { ...c, completedAt: null, createdAt: clock.now() }),
        findById: async (t, id) =>
          s.checkouts.get(id)?.tenantId === t ? clone(s.checkouts.get(id)) : null,
        findByIdAny: async (id) => clone(s.checkouts.get(id)),
        findByStripeId: async (sid) =>
          clone([...s.checkouts.values()].find((c) => c.stripeSessionId === sid)),
        setStatus: async (id, status) => {
          s.checkouts.get(id).status = status;
        },
      },
      transactions: {
        insert: async (t) => {
          if (
            t.idempotencyKey &&
            [...s.transactions.values()].some(
              (x) => x.tenantId === t.tenantId && x.idempotencyKey === t.idempotencyKey,
            )
          )
            throw new ConflictError('ATTEMPT_ALREADY_MADE', 'already');
          s.transactions.set(t.id, clone(t));
          return t;
        },
        save: async (t) => void s.transactions.set(t.id, clone(t)),
        findById: async (tn, id) =>
          s.transactions.get(id)?.tenantId === tn ? clone(s.transactions.get(id)) : null,
        findByCheckout: async (cid) =>
          clone([...s.transactions.values()].reverse().find((t) => t.checkoutSessionId === cid)),
        findByIdempotencyKey: async (tn, key) =>
          clone(
            [...s.transactions.values()].find((t) => t.tenantId === tn && t.idempotencyKey === key),
          ),
        findByIntent: async (pi) =>
          clone([...s.transactions.values()].find((t) => t.stripePaymentIntentId === pi)),
        list: async (tn, f) => {
          const rows = [...s.transactions.values()]
            .filter(
              (t) =>
                t.tenantId === tn &&
                (!f.installmentId || t.installmentId === f.installmentId) &&
                (!f.customerId || t.customerId === f.customerId) &&
                (!f.bookingId || t.bookingId === f.bookingId) &&
                (!f.status || t.status === f.status),
            )
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
          const start = f.cursor ? rows.findIndex((r) => r.id === f.cursor.id) + 1 : 0;
          const limit = f.limit ?? 25;
          const items = rows.slice(start, start + limit).map(clone);
          return {
            items,
            next:
              start + limit < rows.length
                ? { createdAt: items.at(-1).createdAt, id: items.at(-1).id }
                : null,
          };
        },
        listStalePending: async () => [],
        countFailedScheduled: async (t, id) =>
          [...s.transactions.values()].filter(
            (x) =>
              x.tenantId === t &&
              x.installmentId === id &&
              x.trigger === 'scheduled' &&
              x.status === 'failed',
          ).length,
      },
      collection: {
        listCollectable: async (today, { after = null, limit = 500 } = {}) => {
          const [year, month] = today.split('-').map(Number);
          return [...s.invoices.values()]
            .filter((i) => {
              const ref = s.bookingRefs.get(i.bookingId);
              const card = [...s.methods.values()].find(
                (m) =>
                  m.tenantId === i.tenantId &&
                  m.customerId === i.customerId &&
                  m.isActive &&
                  m.status === 'active',
              );
              return (
                ref?.status === 'active' &&
                card &&
                (card.expYear > year || (card.expYear === year && card.expMonth >= month)) &&
                ['scheduled', 'due', 'overdue'].includes(i.status) &&
                i.dueDate <= today &&
                i.paidAmount < i.amount &&
                (!after || i.id > after)
              );
            })
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, limit)
            .map((i) => {
              const txs = [...s.transactions.values()]
                .filter((t) => t.installmentId === i.id && t.trigger === 'scheduled')
                .sort((a, b) => b.createdAt - a.createdAt);
              const failed = txs.filter((t) => t.status === 'failed');
              return {
                invoiceId: i.id,
                tenantId: i.tenantId,
                bookingId: i.bookingId,
                customerId: i.customerId,
                failures: failed.length,
                lastFailureOn: failed[0] ? failed[0].createdAt.toISOString().slice(0, 10) : null,
                lastFailureCode: failed[0]?.failureCode ?? null,
                inFlight: txs.some((t) => t.status === 'pending'),
                balance: i.amount - i.paidAmount,
                currency: s.bookingRefs.get(i.bookingId)?.currency ?? 'PKR',
              };
            });
        },
        listUncollectable: async (today, { after = null, limit = 500 } = {}) => {
          const [year, month] = today.split('-').map(Number);
          return [...s.invoices.values()]
            .map((i) => {
              const ref = s.bookingRefs.get(i.bookingId);
              const card = [...s.methods.values()].find(
                (m) =>
                  m.tenantId === i.tenantId &&
                  m.customerId === i.customerId &&
                  m.isActive &&
                  m.status === 'active',
              );
              const usable =
                card && (card.expYear > year || (card.expYear === year && card.expMonth >= month));
              return { i, ref, card, usable };
            })
            .filter(
              ({ i, ref, usable }) =>
                ref?.status === 'active' &&
                !usable &&
                ['scheduled', 'due', 'overdue'].includes(i.status) &&
                i.dueDate <= today &&
                i.paidAmount < i.amount &&
                (!after || i.id > after),
            )
            .sort((a, b) => a.i.id.localeCompare(b.i.id))
            .slice(0, limit)
            .map(({ i, ref, card }) => ({
              invoiceId: i.id,
              tenantId: i.tenantId,
              bookingId: i.bookingId,
              customerId: i.customerId,
              balance: i.amount - i.paidAmount,
              currency: ref.currency,
              reason: card ? 'card_expired' : 'no_card',
            }));
        },
      },
      collectionAttempts: {
        record: async (rows) => {
          for (const r of rows) {
            const key = `${r.tenantId}:${r.invoiceId}:${r.attemptKey}`;
            if (!s.attempts.has(key)) s.attempts.set(key, r);
          }
        },
      },
      jobRuns: {
        claim: async (job, date) =>
          s.jobRuns.has(`${job}:${date}`) ? false : (s.jobRuns.set(`${job}:${date}`, {}), true),
        finish: async (job, date, o) =>
          void Object.assign(s.jobRuns.get(`${job}:${date}`) ?? {}, o),
        release: async (job, date) => void s.jobRuns.delete(`${job}:${date}`),
      },
      emailLog: {
        open: async (row) => {
          const key = `${row.eventId}:${row.template}`;
          if (!s.emails.has(key)) s.emails.set(key, { ...row, status: 'pending' });
          return { id: s.emails.get(key).id, status: s.emails.get(key).status };
        },
        mark: async (id, status, extra = {}) => {
          const row = [...s.emails.values()].find((e) => e.id === id);
          Object.assign(row, { status, ...extra });
        },
      },
      stripeEvents: {
        receive: async (e) =>
          s.stripeEvents.has(e.id)
            ? false
            : (s.stripeEvents.set(e.id, { status: 'received' }), true),
        finish: async (id, status) => void (s.stripeEvents.get(id).status = status),
        forget: async (id) => void s.stripeEvents.delete(id),
      },
      bookingRefs: {
        insert: async (b) => void s.bookingRefs.set(b.bookingId, { ...b, summarySeq: 0 }),
        findById: async (t, id) =>
          s.bookingRefs.get(id)?.tenantId === t ? clone(s.bookingRefs.get(id)) : null,
        isCancelled: async (id) => s.cancelled.has(id),
        rememberCancelled: async (_t, id) => void s.cancelled.add(id),
        markCancelled: async (id) => (s.bookingRefs.get(id).status = 'cancelled'),
        markCompleted: async (id) => {
          const ref = s.bookingRefs.get(id);
          if (ref.status !== 'active') return false;
          ref.status = 'completed';
          return true;
        },
        nextSeq: async (id) => (s.bookingRefs.get(id).summarySeq += 1),
        refreshCustomer: async (t, customerId, { name, phone, email }) =>
          [...s.bookingRefs.values()]
            .filter((b) => b.tenantId === t && b.customerId === customerId)
            .forEach((b) =>
              Object.assign(b, { customerName: name, customerPhone: phone, customerEmail: email }),
            ),
      },
      summaries: {
        compute: async (t, bookingId, threshold) =>
          summarizeInvoices(
            ofBooking(bookingId).filter((i) => i.tenantId === t),
            threshold,
          ),
        bookingsWithOverdue: async (t) => [
          ...new Set(
            ofTenant(t)
              .filter((i) => i.status === 'overdue')
              .map((i) => i.bookingId),
          ),
        ],
      },
      counters: {
        next: async (t, name, count = 1) =>
          s.counters
            .set(`${t}|${name}`, (s.counters.get(`${t}|${name}`) ?? 0) + count)
            .get(`${t}|${name}`),
      },
      settings: {
        get: async (t) => ({ ...settingsOf(t) }),
        ensure: async (t, d) => void (s.settings.has(t) || s.settings.set(t, { ...d })),
        put: async (t, v) => (s.settings.set(t, { ...v }), { ...v }),
      },
      fines: {
        list: async (t) => s.rules.filter((r) => r.tenantId === t).map(clone),
        findById: async (t, id) => clone(s.rules.find((r) => r.tenantId === t && r.id === id)),
        insert: async (rule, by) => (
          s.rules.push({ ...rule, updatedByName: by, updatedAt: clock.now() }),
          { ...rule, updatedByName: by, updatedAt: clock.now() }
        ),
        update: async (rule, by) => {
          const cur = s.rules.find((r) => r.id === rule.id);
          Object.assign(cur, {
            kind: rule.kind,
            value: rule.value,
            updatedByName: by,
            version: cur.version + 1,
          });
          return clone(cur);
        },
        delete: async (_t, id) => void (s.rules = s.rules.filter((r) => r.id !== id)),
        targetExists: async (t, scope, id) =>
          ({ project: s.projectRefs, unit: s.unitRefs, customer: s.customerRefs })[scope]?.get(id)
            ?.tenantId === t,
        scopeName: async (t, rule) => {
          if (rule.scope === 'default') return null;
          if (rule.scope === 'project') return s.projectRefs.get(rule.scopeId)?.name ?? '';
          if (rule.scope === 'customer') return s.customerRefs.get(rule.scopeId)?.fullName ?? '';
          const u = s.unitRefs.get(rule.scopeId);
          return u ? `${u.unitNo} · ${u.projectName}` : '';
        },
        unitFacts: async (t, unitId) => {
          const unit = s.unitRefs.get(unitId);
          const booking = [...s.bookingRefs.values()].find(
            (b) => b.tenantId === t && b.unitId === unitId && b.status !== 'cancelled',
          );
          return {
            projectId: unit.projectId,
            kind: unit.kind,
            customerId: booking?.customerId ?? null,
          };
        },
        overdueIds: async (t, f, after, limit) =>
          ofTenant(t)
            .filter(
              (i) =>
                i.status === 'overdue' &&
                (!f.projectId || i.projectId === f.projectId) &&
                (!f.customerId || i.customerId === f.customerId) &&
                (!f.unitId || i.unitId === f.unitId) &&
                (!f.unitKind || i.unitKind === f.unitKind) &&
                (!after || i.id > after),
            )
            .map((i) => i.id)
            .sort()
            .slice(0, limit),
        repriceIds: async (t, ids) => {
          const rules = s.rules.filter((r) => r.tenantId === t);
          const changed = [];
          for (const id of ids) {
            const i = s.invoices.get(id);
            if (!i || i.status !== 'overdue') continue;
            const fine = fineFor(
              resolveRule(rules, {
                customerId: i.customerId,
                unitId: i.unitId,
                projectId: i.projectId,
                unitKind: i.unitKind,
              }),
              i.amount,
            );
            if (fine !== i.fineAmount) {
              i.fineAmount = fine;
              i.version += 1;
              changed.push({ id, bookingId: i.bookingId });
            }
          }
          return changed;
        },
      },
      escalations: {
        list: async (t, threshold, { cursor, limit }) => {
          const rows = [...s.bookingRefs.values()]
            .filter((b) => b.tenantId === t)
            .map((b) => escalationRow(t, b, threshold))
            .filter(Boolean)
            .sort((a, b) =>
              a.oldestDueDate < b.oldestDueDate
                ? -1
                : a.oldestDueDate > b.oldestDueDate
                  ? 1
                  : a.id.localeCompare(b.id),
            );
          const size = clampLimit(limit);
          const start = cursor ? decodeCursor(cursor).v : 0;
          return {
            items: rows.slice(start, start + size),
            nextCursor:
              start + size < rows.length ? encodeCursor({ v: start + size, id: 'o' }) : null,
          };
        },
        findOne: async (t, bookingId, threshold) => {
          const ref = s.bookingRefs.get(bookingId);
          return ref?.tenantId === t ? escalationRow(t, ref, threshold) : null;
        },
        insertNotice: async (n) => void s.notices.set(n.bookingId, n),
      },
      stats: {
        collect: async () => ({
          summary: {},
          byMonth: [],
          ageing: [],
          unitsByKind: [],
          byProject: [],
        }),
      },
      tenantRefs: {
        get: async (t) => clone(s.tenantRefs.get(t)),
        upsert: async (ref, at) => {
          const cur = s.tenantRefs.get(ref.tenantId);
          if (cur && cur.sourceAt > at) return false;
          s.tenantRefs.set(ref.tenantId, { ...ref, sourceAt: at });
          return true;
        },
      },
      projectRefs: {
        upsert: async (p, at) => (s.projectRefs.set(p.projectId, { ...p, sourceAt: at }), true),
      },
      unitRefs: {
        upsert: async (u, at) => (s.unitRefs.set(u.unitId, { ...u, sourceAt: at }), true),
      },
      customerRefs: {
        find: async (t, id) =>
          s.customerRefs.get(id)?.tenantId === t ? clone(s.customerRefs.get(id)) : null,
        upsert: async (c, at) => (s.customerRefs.set(c.customerId, { ...c, sourceAt: at }), true),
      },
    },
  };
}

/** One mock Stripe API per test file; each test resets it. Its server never keeps the process alive. */
let sharedMock;
export async function sharedStripeMock() {
  if (!sharedMock) {
    const mock = createMockStripe();
    const server = await listen(mock.app);
    server.server.unref();
    sharedMock = { mock, url: server.url, state: mock.state, sign: mock.sign };
  }
  return sharedMock;
}

/** What the customer does in the embedded form: pays with a card. */
export async function payInCheckout(t, stripeSessionId, number = '4242424242424242') {
  const res = await fetch(
    `${t.stripeMock.url}/_mock/checkout-sessions/${stripeSessionId}/complete`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card: { number, exp_month: 12, exp_year: 2030, cvc: '123' } }),
    },
  );
  return { status: res.status, body: await res.json() };
}

export const movableClock = (startIso = '2026-10-21T09:00:00.000Z') => {
  let ms = Date.parse(startIso);
  return {
    now: () => new Date(ms),
    advance: (delta) => void (ms += delta),
    advanceDays: (d) => void (ms += d * 86_400_000),
  };
};

/** The billing service over fakes, for one tenant (PK) with a known project, unit and customer. */
export async function buildBillingTest({ withCache = false } = {}) {
  const clock = movableClock();
  const memory = makeBillingRepos(clock);
  const { stores } = memory;
  stores.tenantRefs.set(TEST_TENANT_A, {
    tenantId: TEST_TENANT_A,
    slug: 'pk',
    name: 'Zameen',
    currency: 'PKR',
    locale: 'en-PK',
    timeZone: 'Asia/Karachi',
    areaUnit: 'marla',
    sourceAt: '2026-10-01T00:00:00.000Z',
  });
  stores.settings.set(TEST_TENANT_A, { ...DEFAULT_SETTINGS });
  stores.rules.push({
    id: uuid(900),
    tenantId: TEST_TENANT_A,
    scope: 'default',
    scopeId: null,
    unitKind: null,
    kind: 'percent',
    value: 200,
    version: 1,
  });
  stores.projectRefs.set(uuid(201), {
    projectId: uuid(201),
    tenantId: TEST_TENANT_A,
    name: 'Gulberg Greens',
    kind: 'plot_society',
  });
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  const stripeMock = await sharedStripeMock();
  await fetch(`${stripeMock.url}/_mock/reset`, { method: 'POST' });
  const mailer = createMemoryMailer();
  const cacheClient = withCache ? createMemoryClient({ now: () => clock.now().getTime() }) : null;
  const cache = cacheClient
    ? createCache({ client: cacheClient, logger: silentLogger, now: () => clock.now().getTime() })
    : undefined;
  const gateway = createStripeGateway({
    secretKey: 'sk_test_mock',
    webhookSecret: 'whsec_mock',
    apiBase: stripeMock.url,
    maxNetworkRetries: 0,
  });
  const deps = {
    uow: fake.uow,
    clock,
    gateway,
    mailer,
    cache,
    stripe: {
      publishableKey: 'pk_test_mock',
      returnUrl: 'http://app.test/payments/return?checkout={CHECKOUT_ID}',
    },
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
  };
  return {
    ...memory,
    ...fake,
    auth,
    clock,
    gateway,
    mailer,
    cache,
    cacheClient,
    stripeMock,
    deps,
    app: composeBilling(deps),
  };
}

export const actor = (role = 'finance', over = {}) => ({
  tenantId: TEST_TENANT_A,
  userId: uuid(1),
  name: 'Fiona Finance',
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  ...over,
});

export const CONFIRMED = (over = {}) => ({
  booking_id: uuid(500),
  unit: {
    id: uuid(101),
    unit_no: 'A-01',
    kind: 'plot',
    project_id: uuid(201),
    project_name: 'Gulberg Greens',
  },
  customer: {
    id: uuid(301),
    full_name: 'Ali Raza',
    phone: '+92 300 1234567',
    email: 'ali@example.test',
  },
  plan: { name: '20% down + 12 monthly', down_pct: 20, installment_count: 12 },
  total_price: 1_200_000_00,
  currency: 'PKR',
  booked_at: '2026-10-21',
  ...over,
});

export const newBookingId = () => newId();
