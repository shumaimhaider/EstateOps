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
import { silentLogger } from '@estateops/platform';
import { TEST_TENANT_A, createFakeUow, createTestAuth } from '@estateops/platform/testing';
import { composeBilling } from '../src/main/compose.js';
import { INSTALLMENT_SORT_FIELDS } from '../src/installments/application/ListInstallments.js';
import { createFakeCardGateway } from '../src/installments/infrastructure/FakeCardGateway.js';
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
    intents: new Map(),
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
      intents: {
        insert: async (i) => void s.intents.set(i.providerId, { ...i, recorded: false }),
        findByProviderId: async (t, id) =>
          s.intents.get(id)?.tenantId === t ? clone(s.intents.get(id)) : null,
        markRecorded: async (id) => {
          const intent = [...s.intents.values()].find((x) => x.id === id);
          intent.recorded = true;
        },
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
        upsert: async (c, at) => (s.customerRefs.set(c.customerId, { ...c, sourceAt: at }), true),
      },
    },
  };
}

export const movableClock = (startIso = '2026-10-21T09:00:00.000Z') => {
  let ms = Date.parse(startIso);
  return { now: () => new Date(ms), advanceDays: (d) => void (ms += d * 86_400_000) };
};

/** The billing service over fakes, for one tenant (PK) with a known project, unit and customer. */
export async function buildBillingTest() {
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
  const gateway = createFakeCardGateway({ clock });
  const deps = {
    uow: fake.uow,
    clock,
    gateway,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
    mockCard: true,
  };
  return { ...memory, ...fake, auth, clock, gateway, deps, app: composeBilling(deps) };
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
