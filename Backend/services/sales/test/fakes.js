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
import { composeSales } from '../src/main/compose.js';
import { BOOKING_SORT_FIELDS } from '../src/bookings/application/ListBookings.js';
import { LIVE_STATUSES } from '../src/bookings/domain/booking.js';

const ci = (s) => String(s ?? '').toLowerCase();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export { uuid };

/** In-memory sales repositories: one live booking per unit, versions, snapshot refs. */
export function makeSalesRepos() {
  const s = { plans: new Map(), bookings: new Map(), unitRefs: new Map(), customerRefs: new Map() };
  const clone = (x) => (x ? structuredClone(x) : null);
  const inTenant = (map, t) => [...map.values()].filter((r) => r.tenantId === t);
  const stamp = new Date('2026-10-21T09:00:00Z');

  return {
    stores: s,
    repos: {
      plans: {
        insert: async (p) => {
          if (inTenant(s.plans, p.tenantId).some((x) => ci(x.name) === ci(p.name)))
            throw new ConflictError('PLAN_NAME_TAKEN', 'taken');
          s.plans.set(p.id, { ...p });
          return p;
        },
        findById: async (t, id) =>
          s.plans.get(id)?.tenantId === t ? clone(s.plans.get(id)) : null,
        nameTaken: async (t, name) => inTenant(s.plans, t).some((x) => ci(x.name) === ci(name)),
        update: async (p) => {
          const cur = s.plans.get(p.id);
          if (!cur) throw new NotFoundError();
          if (cur.version !== p.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
          const saved = { ...cur, ...p, version: cur.version + 1 };
          s.plans.set(p.id, saved);
          return clone(saved);
        },
        inUse: async (t, id) => inTenant(s.bookings, t).some((b) => b.planId === id),
        delete: async (_t, id) => void s.plans.delete(id),
        list: async (t) =>
          inTenant(s.plans, t)
            .sort((a, b) => ci(a.name).localeCompare(ci(b.name)))
            .map(clone),
      },
      bookings: {
        insert: async (b) => {
          if (
            [...s.bookings.values()].some(
              (x) => x.unitId === b.unitId && LIVE_STATUSES.includes(x.status),
            )
          )
            throw new ConflictError('UNIT_ALREADY_BOOKED', 'live');
          s.bookings.set(b.id, { ...b, createdAt: stamp, updatedAt: stamp });
          return b;
        },
        findById: async (t, id) =>
          s.bookings.get(id)?.tenantId === t ? clone(s.bookings.get(id)) : null,
        hasLiveBookingForUnit: async (unitId) =>
          [...s.bookings.values()].some(
            (x) => x.unitId === unitId && LIVE_STATUSES.includes(x.status),
          ),
        update: async (b) => {
          const cur = s.bookings.get(b.id);
          if (!cur) throw new NotFoundError();
          if (cur.version !== b.version) throw new ConflictError('VERSION_CONFLICT', 'changed');
          const saved = { ...cur, ...b, version: cur.version + 1 };
          s.bookings.set(b.id, saved);
          return clone(saved);
        },
        list: async (t, f) => {
          const picked = parseSort(f.sort, BOOKING_SORT_FIELDS, {
            field: 'booked_at',
            dir: 'desc',
          });
          const key = {
            unit_no: 'unitNo',
            total_price: 'totalPrice',
            received_amount: 'receivedAmount',
            pending_amount: 'pendingAmount',
            overdue_amount: 'overdueAmount',
            booked_at: 'bookedAt',
            next_due_date: 'nextDueDate',
          }[picked.field];
          let rows = inTenant(s.bookings, t).filter(
            (b) =>
              (!f.status || b.status === f.status) &&
              (!f.kind || b.unitKind === f.kind) &&
              (!f.projectId || b.projectId === f.projectId) &&
              (!f.unitId || b.unitId === f.unitId) &&
              (!f.customerId || b.customerId === f.customerId) &&
              (!f.escalated || b.escalated),
          );
          if (f.q?.trim())
            rows = rows.filter((b) =>
              `${b.unitNo} ${b.buyerName} ${b.projectName}`
                .toLowerCase()
                .includes(f.q.trim().toLowerCase()),
            );
          const val = (b) => b[key] ?? '9999-12-31';
          rows.sort(
            (a, b) =>
              (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : a.id.localeCompare(b.id)) *
              (picked.dir === 'desc' ? -1 : 1),
          );
          const size = clampLimit(f.limit);
          const start = f.cursor ? decodeCursor(f.cursor).v : 0;
          return {
            items: rows.slice(start, start + size).map(clone),
            nextCursor:
              start + size < rows.length ? encodeCursor({ v: start + size, id: 'o' }) : null,
          };
        },
        refreshUnitNames: async (t, unitId, { unitNo, projectName }) =>
          inTenant(s.bookings, t)
            .filter((b) => b.unitId === unitId)
            .forEach((b) => Object.assign(b, { unitNo, projectName })),
        refreshBuyer: async (t, customerId, { name, phone, email }) =>
          inTenant(s.bookings, t)
            .filter((b) => b.customerId === customerId)
            .forEach((b) =>
              Object.assign(b, { buyerName: name, buyerPhone: phone, buyerEmail: email }),
            ),
      },
      unitRefs: {
        get: async (t, id) =>
          s.unitRefs.get(id)?.tenantId === t ? clone(s.unitRefs.get(id)) : null,
        upsert: async (u, sourceAt) => {
          const cur = s.unitRefs.get(u.unitId);
          if (cur && cur.sourceAt > sourceAt) return false;
          s.unitRefs.set(u.unitId, { ...u, sourceAt });
          return true;
        },
      },
      customerRefs: {
        get: async (t, id) =>
          s.customerRefs.get(id)?.tenantId === t ? clone(s.customerRefs.get(id)) : null,
        upsert: async (c, sourceAt) => {
          const cur = s.customerRefs.get(c.customerId);
          if (cur && cur.sourceAt > sourceAt) return false;
          s.customerRefs.set(c.customerId, { ...c, sourceAt });
          return true;
        },
      },
    },
  };
}

export const clock = { now: () => new Date('2026-10-21T09:00:00.000Z') };

export const UNIT_REF = {
  unitId: uuid(101),
  tenantId: TEST_TENANT_A,
  projectId: uuid(201),
  projectName: 'Gulberg Greens',
  unitNo: 'A-01',
  kind: 'plot',
  status: 'available',
  listPrice: 1_000_000_00,
  currency: 'PKR',
  sourceAt: '2026-10-20T00:00:00.000Z',
};
export const CUSTOMER_REF = {
  customerId: uuid(301),
  tenantId: TEST_TENANT_A,
  fullName: 'Ali Raza',
  phone: '+92 300 1234567',
  email: 'ali@example.test',
  sourceAt: '2026-10-20T00:00:00.000Z',
};

/** The sales service over fakes, with one unit, one customer and one plan already known. */
export async function buildSalesTest() {
  const memory = makeSalesRepos();
  memory.stores.unitRefs.set(UNIT_REF.unitId, { ...UNIT_REF });
  memory.stores.customerRefs.set(CUSTOMER_REF.customerId, { ...CUSTOMER_REF });
  const plan = {
    id: uuid(401),
    tenantId: TEST_TENANT_A,
    name: '20% down + 12 monthly',
    downPct: 20,
    installmentCount: 12,
    version: 1,
  };
  memory.stores.plans.set(plan.id, plan);
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  const deps = {
    uow: fake.uow,
    clock,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
  };
  return { ...memory, ...fake, auth, deps, plan, app: composeSales(deps) };
}

export const actor = (role = 'owner', over = {}) => ({
  tenantId: TEST_TENANT_A,
  userId: uuid(1),
  name: 'Test User',
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  ...over,
});
