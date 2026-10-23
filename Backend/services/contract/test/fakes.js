import { ConflictError, DEFAULT_ROLE_PERMISSIONS, NotFoundError } from '@estateops/kernel';
import { silentLogger } from '@estateops/platform';
import { TEST_TENANT_A, createFakeUow, createTestAuth } from '@estateops/platform/testing';
import { composeContract } from '../src/main/compose.js';
import { OPEN_STATUSES } from '../src/contracts/domain/contract.js';
import { createFakeESignProvider } from '../src/contracts/infrastructure/FakeESignProvider.js';

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const PDF = Buffer.from('%PDF-1.4 signed sale agreement');

/** In-memory contract repositories that enforce the same partial unique rules as the SQL indexes. */
export function makeContractRepos(clock) {
  const s = { contracts: new Map(), bookingRefs: new Map() };
  const clone = (x) => (x ? structuredClone(x) : null);
  const stamp = () => clock.now();
  const check = (k, ignoreId = null) => {
    const others = [...s.contracts.values()].filter(
      (o) => o.bookingId === k.bookingId && o.id !== ignoreId,
    );
    if (k.status === 'signed' && others.some((o) => o.status === 'signed'))
      throw new ConflictError('CONTRACT_ALREADY_SIGNED', 'signed');
    if (
      k.kind === 'pandadoc' &&
      OPEN_STATUSES.includes(k.status) &&
      others.some((o) => o.kind === 'pandadoc' && OPEN_STATUSES.includes(o.status))
    )
      throw new ConflictError('CONTRACT_OPEN', 'open');
    if (others.some((o) => o.version === k.version))
      throw new ConflictError('CONTRACT_VERSION_TAKEN', 'version');
  };
  return {
    stores: s,
    repos: {
      contracts: {
        insert: async (k) => {
          check(k);
          s.contracts.set(k.id, { ...k, createdAt: stamp(), updatedAt: stamp(), lockVersion: 1 });
          return k;
        },
        findById: async (t, id) =>
          s.contracts.get(id)?.tenantId === t ? clone(s.contracts.get(id)) : null,
        findByProviderDocumentId: async (documentId) =>
          clone([...s.contracts.values()].find((k) => k.providerDocumentId === documentId)),
        listForBooking: async (t, bookingId) =>
          [...s.contracts.values()]
            .filter((k) => k.tenantId === t && k.bookingId === bookingId)
            .sort((a, b) => b.version - a.version)
            .map(clone),
        update: async (k) => {
          const cur = s.contracts.get(k.id);
          if (!cur) throw new NotFoundError();
          if (cur.lockVersion !== k.lockVersion)
            throw new ConflictError('VERSION_CONFLICT', 'changed');
          check(k, k.id);
          const saved = { ...cur, ...k, lockVersion: cur.lockVersion + 1, updatedAt: stamp() };
          s.contracts.set(k.id, saved);
          return clone(saved);
        },
      },
      bookingRefs: {
        findById: async (t, id) =>
          s.bookingRefs.get(id)?.tenantId === t ? clone(s.bookingRefs.get(id)) : null,
        upsert: async (b) => {
          if (!s.bookingRefs.get(b.bookingId)?.cancelled)
            s.bookingRefs.set(b.bookingId, { ...b, cancelled: false });
        },
        markCancelled: async ({ bookingId, tenantId, customerId }) => {
          const cur = s.bookingRefs.get(bookingId);
          s.bookingRefs.set(bookingId, {
            ...(cur ?? {
              bookingId,
              tenantId,
              customerId,
              customerName: '',
              customerEmail: null,
              unitNo: '',
            }),
            cancelled: true,
          });
        },
      },
    },
  };
}

export const clock = { now: () => new Date('2026-10-21T09:00:00.000Z') };

/** A simple in-memory FileStore with the same put/get/remove contract as the disk one. */
export function createMemoryFileStore() {
  const files = new Map();
  return {
    files,
    put: async (key, buffer) => void files.set(key, Buffer.from(buffer)),
    get: async (key) => {
      if (!files.has(key)) throw new NotFoundError('File not found');
      return files.get(key);
    },
    remove: async (key) => void files.delete(key),
  };
}

export async function buildContractTest({ esign = createFakeESignProvider() } = {}) {
  const memory = makeContractRepos(clock);
  memory.stores.bookingRefs.set(uuid(500), {
    bookingId: uuid(500),
    tenantId: TEST_TENANT_A,
    customerId: uuid(301),
    customerName: 'Ali Raza',
    customerEmail: 'ali@example.test',
    unitNo: 'A-01',
    cancelled: false,
  });
  const fake = createFakeUow(() => memory.repos);
  const auth = await createTestAuth();
  const files = createMemoryFileStore();
  const deps = {
    uow: fake.uow,
    clock,
    files,
    esign,
    verifier: auth.verifier,
    logger: silentLogger,
    internalToken: 'test-internal-token',
    mockSigner: true,
  };
  return { ...memory, ...fake, auth, files, esign, deps, app: composeContract(deps) };
}

export const actor = (role = 'sales_manager', over = {}) => ({
  tenantId: TEST_TENANT_A,
  userId: uuid(1),
  name: 'Sam Sales',
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  ...over,
});
export const upload = (over = {}) => ({
  name: 'signed.pdf',
  contentType: 'application/pdf',
  size: PDF.length,
  buffer: PDF,
  ...over,
});
