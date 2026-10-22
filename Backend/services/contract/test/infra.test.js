import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { newId } from '@estateops/kernel';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createTypeormUow,
  silentLogger,
} from '@estateops/platform';
import {
  createTestAuth,
  createTestDatabase,
  deliverEvent,
  postgresAvailable,
} from '@estateops/platform/testing';
import { ActOnContract } from '../src/contracts/application/ActOnContract.js';
import { CreatePandaDocContract } from '../src/contracts/application/CreatePandaDocContract.js';
import { UploadSignedContract } from '../src/contracts/application/UploadSignedContract.js';
import { createPandaDocContract, createSignedUpload } from '../src/contracts/domain/contract.js';
import { createFakeESignProvider } from '../src/contracts/infrastructure/FakeESignProvider.js';
import { createLocalFileStore } from '../src/contracts/infrastructure/LocalFileStore.js';
import { composeContract } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { PDF, actor, clock, upload } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[contract db tests] no PostgreSQL reachable: skipping\n');

describe('local file store', () => {
  let dir;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'estateops-files-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('writes, reads and removes files by key, creating folders as needed', async () => {
    const files = createLocalFileStore(dir);
    await files.put('tenant-1/booking-1/a.pdf', PDF);
    expect((await files.get('tenant-1/booking-1/a.pdf')).equals(PDF)).toBe(true);
    await files.remove('tenant-1/booking-1/a.pdf');
    await expect(files.get('tenant-1/booking-1/a.pdf')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await files.remove('tenant-1/booking-1/never-existed.pdf'); // removing a missing file is fine
    expect((await readdir(dir)).length).toBeGreaterThan(0);
  });
  it('never lets a crafted key leave the storage directory', async () => {
    const files = createLocalFileStore(dir);
    for (const key of ['../escape.pdf', '../../etc/passwd', 'a/../../escape.pdf', '/etc/passwd']) {
      await expect(files.put(key, PDF)).rejects.toThrow(/Invalid file key/);
      await expect(files.get(key)).rejects.toThrow(/Invalid file key/);
    }
  });
});

describe.skipIf(!available)('contract on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  let dir;
  let files;
  const run = (work) => uow.run(work);
  const tenantId = newId();
  const sales = actor('sales_manager', { tenantId, userId: newId() });

  const mkBooking = async (over = {}) => {
    const b = {
      bookingId: newId(),
      tenantId,
      customerId: newId(),
      customerName: 'Ali Raza',
      customerEmail: 'ali@example.test',
      unitNo: 'A-01',
      ...over,
    };
    await run((r) => r.bookingRefs.upsert(b));
    return b;
  };
  const draftOf = (b, over = {}) =>
    createPandaDocContract({
      tenantId,
      bookingId: b.bookingId,
      template: 'sale_agreement',
      signerEmail: 'ali@example.test',
      version: 1,
      documentId: `pd_${newId().slice(0, 8)}`,
      createdByName: 'S',
      ...over,
    });
  const signedOf = (b, over = {}) =>
    createSignedUpload({
      tenantId,
      bookingId: b.bookingId,
      file: upload(),
      version: 1,
      fileKey: `${tenantId}/${b.bookingId}/${newId()}.pdf`,
      createdByName: 'S',
      now: new Date('2026-10-21T09:00:00Z'),
      ...over,
    });
  const deps = () => ({ uow, clock, files, esign: createFakeESignProvider() });

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 12 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'contract', buildRepos });
    dir = await mkdtemp(path.join(os.tmpdir(), 'estateops-contracts-'));
    files = createLocalFileStore(dir);
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
    await rm(dir, { recursive: true, force: true });
  });

  describe('constraints the database enforces', () => {
    it('allows one open PandaDoc contract and one signed contract per booking, even when asked directly', async () => {
      const b = await mkBooking();
      await run((r) => r.contracts.insert(draftOf(b)));
      await expect(
        run((r) => r.contracts.insert(draftOf(b, { version: 2 }))),
      ).rejects.toMatchObject({ code: 'CONTRACT_OPEN' });
      await run((r) => r.contracts.insert({ ...signedOf(b, { version: 3 }) }));
      await expect(
        run((r) => r.contracts.insert(signedOf(b, { version: 4 }))),
      ).rejects.toMatchObject({ code: 'CONTRACT_ALREADY_SIGNED' });
      await expect(
        run((r) => r.contracts.insert(draftOf(b, { version: 3 }))),
      ).rejects.toMatchObject({ code: expect.stringMatching(/CONTRACT_/) });
    });

    it('keeps versions unique per booking and numbers of different bookings independent', async () => {
      const a = await mkBooking();
      const b = await mkBooking();
      const first = draftOf(a);
      await run((r) => r.contracts.insert(first));
      await run((r) => r.contracts.update({ ...first, status: 'voided', lockVersion: 1 }));
      await expect(run((r) => r.contracts.insert(draftOf(a)))).rejects.toMatchObject({
        code: 'CONTRACT_VERSION_TAKEN',
      });
      await expect(run((r) => r.contracts.insert(draftOf(b)))).resolves.toBeTruthy();
    });

    it('rejects an uploaded contract without its file, a PandaDoc contract with one, a bad size and a bad status', async () => {
      const b = await mkBooking();
      const row = (over) => ({ ...signedOf(b), id: newId(), ...over });
      const insert = (k) =>
        ds.query(
          `INSERT INTO contract.contract (id, tenant_id, booking_id, kind, title, status, version, file_key, file_size, content_type)
         VALUES ($1, $2, $3, $4, 't', $5, $6, $7, $8, 'application/pdf')`,
          [k.id, tenantId, b.bookingId, k.kind, k.status, k.version, k.fileKey, k.fileSize],
        );
      await expect(insert(row({ fileKey: null, version: 5 }))).rejects.toMatchObject({
        driverError: { constraint: 'contract_upload_chk' },
      });
      await expect(
        insert({ ...draftOf(b, { version: 6 }), id: newId(), fileKey: 'x', fileSize: 10 }),
      ).rejects.toMatchObject({ driverError: { constraint: 'contract_pandadoc_chk' } });
      await expect(
        insert(row({ fileSize: 10 * 1024 * 1024 + 1, version: 7 })),
      ).rejects.toMatchObject({ driverError: { constraint: 'contract_file_size_chk' } });
      await expect(insert(row({ status: 'lost', version: 8 }))).rejects.toMatchObject({
        driverError: { constraint: 'contract_status_chk' },
      });
    });

    it('stops a booking with contracts from being removed', async () => {
      const b = await mkBooking();
      await run((r) => r.contracts.insert(draftOf(b)));
      await expect(
        ds.query('DELETE FROM contract.booking_ref WHERE booking_id = $1', [b.bookingId]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
    });
  });

  describe('repositories', () => {
    it('round-trips a contract with its timestamps and sizes, listing newest first', async () => {
      const b = await mkBooking();
      const first = draftOf(b);
      await run((r) => r.contracts.insert(first));
      const sent = await run((r) =>
        r.contracts.update({
          ...first,
          status: 'sent',
          sentAt: new Date('2026-10-21T09:00:00Z'),
          lockVersion: 1,
        }),
      );
      expect(sent.lockVersion).toBe(2);
      const voided = await run((r) => r.contracts.update({ ...sent, status: 'voided' }));
      await run((r) => r.contracts.insert(signedOf(b, { version: 2 })));
      const list = await run((r) => r.contracts.listForBooking(tenantId, b.bookingId));
      expect(list.map((c) => [c.version, c.status])).toEqual([
        [2, 'signed'],
        [1, 'voided'],
      ]);
      expect(list[0]).toMatchObject({
        fileSize: PDF.length,
        kind: 'signed_upload',
        fileName: 'signed.pdf',
      });
      expect(list[1].sentAt).toEqual(new Date('2026-10-21T09:00:00Z'));
      expect(voided.lockVersion).toBe(3);
      await expect(
        run((r) => r.contracts.update({ ...first, status: 'draft', lockVersion: 1 })),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    it('never lets a cancelled booking be revived by a late confirmation', async () => {
      const b = {
        bookingId: newId(),
        tenantId,
        customerId: newId(),
        customerName: 'X',
        customerEmail: null,
        unitNo: 'U',
      };
      await run((r) => r.bookingRefs.markCancelled(b));
      await run((r) =>
        r.bookingRefs.upsert({ ...b, customerName: 'Real Name', customerEmail: 'real@x.test' }),
      );
      expect(await run((r) => r.bookingRefs.findById(tenantId, b.bookingId))).toMatchObject({
        cancelled: true,
        customerName: '',
      });
      expect(await run((r) => r.bookingRefs.findById(newId(), b.bookingId))).toBeNull();
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of several simultaneous requests start a PandaDoc contract', async () => {
      const b = await mkBooking();
      const create = new CreatePandaDocContract(deps());
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          create.execute({ actor: sales, bookingId: b.bookingId, template: 'sale_agreement' }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((x) => x.status === 'rejected'))
        expect(r.reason).toMatchObject({ code: 'CONTRACT_OPEN' });
      expect(
        (
          await ds.query('SELECT count(*)::int AS n FROM contract.contract WHERE booking_id = $1', [
            b.bookingId,
          ])
        )[0].n,
      ).toBe(1);
    });

    it('stores one signed copy when several uploads race, and leaves no orphaned files from the losers', async () => {
      const b = await mkBooking();
      const up = new UploadSignedContract(deps());
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          up.execute({ actor: sales, bookingId: b.bookingId, file: upload() }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const stored = await readdir(path.join(dir, tenantId, b.bookingId));
      expect(stored).toHaveLength(1);
      expect(
        (
          await ds.query(
            `SELECT count(*)::int AS n FROM contract.contract WHERE booking_id = $1 AND status = 'signed'`,
            [b.bookingId],
          )
        )[0].n,
      ).toBe(1);
    });

    it('serialises two people revising the same contract: one new draft, the other refused', async () => {
      const b = await mkBooking();
      const created = await new CreatePandaDocContract(deps()).execute({
        actor: sales,
        bookingId: b.bookingId,
        template: 'sale_agreement',
      });
      const act = new ActOnContract(deps());
      const revise = () =>
        act.execute({ actor: sales, id: created.contract.id, action: 'revise', note: 'Corrected' });
      const results = await Promise.allSettled([revise(), revise()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({
        code: 'INVALID_TRANSITION',
      });
      const list = await run((r) => r.contracts.listForBooking(tenantId, b.bookingId));
      expect(list.map((c) => [c.version, c.status])).toEqual([
        [2, 'draft'],
        [1, 'voided'],
      ]);
    });
  });

  it('serves the whole service on the real stack: upload, list, download, draft, sign, cancel', async () => {
    const auth = await createTestAuth();
    const esign = createFakeESignProvider();
    const app = composeContract({
      uow,
      clock,
      files,
      esign,
      verifier: auth.verifier,
      logger: silentLogger,
      internalToken: 'test-internal-token',
      idempotencyStore: createIdempotencyStore(ds, { schema: 'contract' }),
      readyCheck: () => ds.query('SELECT 1'),
      mockSigner: true,
    });
    const tid = newId();
    const owner = await auth.bearer({ role: 'owner', tenantId: tid });
    const bookingId = newId();
    await deliverEvent(
      app,
      buildEvent({
        type: EVENT.BOOKING_CONFIRMED,
        tenantId: tid,
        producer: 'sales',
        data: {
          booking_id: bookingId,
          unit: {
            id: newId(),
            unit_no: 'A-1',
            kind: 'plot',
            project_id: newId(),
            project_name: 'P',
          },
          customer: { id: newId(), full_name: 'Zoya', phone: null, email: 'zoya@x.test' },
          plan: { name: 'p', down_pct: 20, installment_count: 12 },
          total_price: 1000,
          currency: 'PKR',
          booked_at: '2026-10-21',
        },
      }),
    );

    const uploaded = await request(app)
      .post(`/api/v1/admin/bookings/${bookingId}/contracts/signed`)
      .set(owner)
      .attach('file', PDF, { filename: 'deed.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    const file = await request(app)
      .get(`/api/v1/admin/contracts/${uploaded.body.id}/file`)
      .set(owner);
    expect(Buffer.from(file.body).equals(PDF)).toBe(true);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/contracts/${uploaded.body.id}/void`)
          .set(owner)
          .send({})
      ).body.status,
    ).toBe('voided');
    const draft = await request(app)
      .post(`/api/v1/admin/bookings/${bookingId}/contracts/pandadoc`)
      .set(owner)
      .send({ template: 'sale_agreement' });
    expect(draft.status).toBe(201);
    await request(app).post(`/api/v1/admin/contracts/${draft.body.id}/send`).set(owner).send({});
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/mock/contracts/${draft.body.id}/events/signed`)
          .set(owner)
          .send({})
      ).body.status,
    ).toBe('signed');

    const list = await request(app)
      .get(`/api/v1/admin/contracts?booking_id=${bookingId}`)
      .set(owner);
    expect(list.body.data.map((c) => [c.version, c.kind, c.status])).toEqual([
      [2, 'pandadoc', 'signed'],
      [1, 'signed_upload', 'voided'],
    ]);
    const audit = (
      await ds.query(
        'SELECT action FROM contract.audit_log WHERE tenant_id = $1 ORDER BY created_at, id',
        [tid],
      )
    ).map((r) => r.action);
    expect(audit).toEqual([
      'contract.upload',
      'contract.void',
      'contract.create',
      'contract.send',
      'contract.signed',
    ]);
    const events = (
      await ds.query(
        `SELECT payload->'data'->>'status' AS status FROM contract.outbox WHERE tenant_id = $1 AND type = 'contract.status_changed' ORDER BY created_at, id`,
        [tid],
      )
    ).map((r) => r.status);
    expect(events).toEqual(['signed', 'voided', 'draft', 'sent', 'signed']);
    expect((await request(app).get('/health/ready')).status).toBe(200);
  });
});
