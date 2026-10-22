import {
  ConflictError,
  DEFAULT_ROLE_PERMISSIONS,
  NotFoundError,
  clampLimit,
  decodeCursor,
  encodeCursor,
  parseSort,
} from '@estateops/kernel';
import { silentLogger } from '@estateops/platform';
import { TEST_TENANT_A, createFakeUow, createTestAuth } from '@estateops/platform/testing';
import { composeCustomer } from '../src/main/compose.js';
import { CUSTOMER_SORT_FIELDS } from '../src/customers/application/ListCustomers.js';

const ci = (s) => String(s ?? '').toLowerCase();

/** In-memory customer repositories: same uniqueness, versions, and sum-over-bookings totals as SQL. */
export function makeCustomerRepos() {
  const s = { customers: new Map(), summaries: new Map(), tenantRefs: new Map() };
  const inTenant = (t) => [...s.customers.values()].filter((c) => c.tenantId === t);
  const clone = (x) => (x ? structuredClone(x) : null);

  const customers = {
    insert: async (c) => {
      if (c.email && inTenant(c.tenantId).some((x) => ci(x.email) === ci(c.email)))
        throw new ConflictError('EMAIL_TAKEN', 'taken');
      s.customers.set(c.id, {
        ...c,
        createdAt: new Date('2026-10-21T09:00:00Z'),
        updatedAt: new Date('2026-10-21T09:00:00Z'),
      });
      return c;
    },
    findById: async (t, id) =>
      s.customers.get(id)?.tenantId === t ? clone(s.customers.get(id)) : null,
    emailTaken: async (t, email) => inTenant(t).some((x) => ci(x.email) === ci(email)),
    update: async (c) => {
      const cur = s.customers.get(c.id);
      if (!cur) throw new NotFoundError();
      if (cur.version !== c.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
      const saved = { ...cur, ...c, version: cur.version + 1 };
      s.customers.set(c.id, saved);
      return clone(saved);
    },
    delete: async (_t, id) => void s.customers.delete(id),
    hasSummaries: async (t, id) =>
      [...s.summaries.values()].some((x) => x.tenantId === t && x.customerId === id),
    list: async (t, { q, hasOverdue, sort, cursor, limit }) => {
      const picked = parseSort(sort, CUSTOMER_SORT_FIELDS, { field: 'full_name', dir: 'asc' });
      const key = {
        full_name: 'fullName',
        bookings_count: 'bookingsCount',
        total_value: 'totalValue',
        received_amount: 'receivedAmount',
        pending_amount: 'pendingAmount',
        overdue_amount: 'overdueAmount',
      }[picked.field];
      let rows = inTenant(t);
      if (hasOverdue) rows = rows.filter((c) => c.overdueAmount > 0);
      if (q?.trim())
        rows = rows.filter((c) =>
          `${c.fullName} ${c.phone ?? ''} ${c.email ?? ''} ${c.unitsSummary.join(' ')}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
        );
      const val = (c) => (key === 'fullName' ? ci(c.fullName) : c[key]);
      rows.sort(
        (a, b) =>
          (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : a.id.localeCompare(b.id)) *
          (picked.dir === 'desc' ? -1 : 1),
      );
      const size = clampLimit(limit);
      const start = cursor ? decodeCursor(cursor).v : 0;
      return {
        items: rows.slice(start, start + size).map(clone),
        nextCursor: start + size < rows.length ? encodeCursor({ v: start + size, id: 'o' }) : null,
      };
    },
    recomputeTotals: async (t, customerId) => {
      const live = [...s.summaries.values()].filter(
        (x) => x.tenantId === t && x.customerId === customerId && !x.cancelled,
      );
      const c = s.customers.get(customerId);
      const sum = (k) => live.reduce((a, x) => a + x[k], 0);
      Object.assign(c, {
        bookingsCount: live.length,
        totalValue: sum('totalPrice'),
        receivedAmount: sum('receivedAmount'),
        pendingAmount: sum('pendingAmount'),
        overdueAmount: sum('overdueAmount'),
        escalatedCount: live.filter((x) => x.escalated).length,
        unitsSummary: live.map((x) => x.unitNo).sort(),
      });
    },
  };
  return {
    stores: s,
    repos: {
      customers,
      bookingSummaries: {
        upsert: async (x) => {
          const cur = s.summaries.get(x.bookingId);
          if (cur && (cur.seq >= x.seq || cur.cancelled)) return false;
          s.summaries.set(x.bookingId, { ...x, cancelled: false });
          return true;
        },
        markCancelled: async (_t, bookingId) => {
          const cur = s.summaries.get(bookingId);
          if (cur) cur.cancelled = true;
        },
      },
      tenantRefs: {
        get: async (t) => s.tenantRefs.get(t) ?? null,
        upsert: async (ref, sourceAt) => {
          const cur = s.tenantRefs.get(ref.tenantId);
          if (cur && cur.sourceAt > sourceAt) return false;
          s.tenantRefs.set(ref.tenantId, { ...ref, sourceAt });
          return true;
        },
      },
    },
  };
}

export const clock = { now: () => new Date('2026-10-21T09:00:00.000Z') };

export async function buildCustomerTest() {
  const memory = makeCustomerRepos();
  memory.stores.tenantRefs.set(TEST_TENANT_A, {
    tenantId: TEST_TENANT_A,
    currency: 'PKR',
    sourceAt: '2026-10-20T00:00:00.000Z',
  });
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  const deps = {
    uow: fake.uow,
    clock,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
  };
  return { ...memory, ...fake, auth, deps, app: composeCustomer(deps) };
}

export const actor = (role = 'owner', over = {}) => ({
  tenantId: TEST_TENANT_A,
  userId: '00000000-0000-4000-8000-000000000001',
  name: 'Test User',
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  ...over,
});

export const CUSTOMER = {
  fullName: 'Ali Raza',
  phone: '+92 300 1234567',
  email: 'Ali@Example.test',
  idNumber: '35202-1234567-1',
  city: 'Lahore',
  preferredLanguage: 'en',
};
