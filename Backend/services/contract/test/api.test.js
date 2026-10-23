import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B, deliverEvent } from '@estateops/platform/testing';
import { MAX_FILE_BYTES } from '../src/contracts/domain/contract.js';
import { PDF, buildContractTest, uuid } from './fakes.js';

const BASE = '/api/v1/admin';
const KEYS = [
  'allowed_actions',
  'booking_id',
  'created_at',
  'created_by_name',
  'file_name',
  'file_size',
  'id',
  'kind',
  'pandadoc_document_id',
  'pandadoc_url',
  'revision_note',
  'sent_at',
  'signed_at',
  'signer_email',
  'status',
  'supersedes_id',
  'template',
  'tenant_id',
  'title',
  'updated_at',
  'version',
];

describe('contract API', () => {
  let t;
  let sales;
  const get = (path, h = sales) => request(t.app).get(`${BASE}${path}`).set(h);
  const post = (path, body, h = sales) => request(t.app).post(`${BASE}${path}`).set(h).send(body);
  const uploadPdf = (
    h = sales,
    {
      buffer = PDF,
      filename = 'signed.pdf',
      type = 'application/pdf',
      title,
      booking = uuid(500),
    } = {},
  ) => {
    const req = request(t.app).post(`${BASE}/bookings/${booking}/contracts/signed`).set(h);
    if (title) req.field('title', title);
    return req.attach('file', buffer, { filename, contentType: type });
  };
  const draft = async () =>
    (await post(`/bookings/${uuid(500)}/contracts/pandadoc`, { template: 'sale_agreement' })).body;

  beforeEach(async () => {
    t = await buildContractTest();
    sales = await t.auth.bearer({ role: 'sales_manager' });
  });

  it('drafts a contract in exactly the shape the UI parses, with the PandaDoc link', async () => {
    const res = await post(`/bookings/${uuid(500)}/contracts/pandadoc`, {
      template: 'sale_agreement',
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(KEYS);
    expect(res.body).toMatchObject({
      kind: 'pandadoc',
      status: 'draft',
      version: 1,
      title: 'Sale agreement',
      template: 'sale_agreement',
      signer_email: 'ali@example.test',
      file_name: null,
      tenant_id: TEST_TENANT_A,
      allowed_actions: ['send', 'revise', 'void'],
    });
    expect(res.body.pandadoc_url).toBe(
      `https://app.pandadoc.com/a/#/documents/${res.body.pandadoc_document_id}`,
    );
  });

  it('lists a booking’s contracts newest first, and answers 422 or 404 for a bad request', async () => {
    const first = await draft();
    await post(`/contracts/${first.id}/revise`, { note: 'Corrected' });
    const list = await get(`/contracts?booking_id=${uuid(500)}`);
    expect(list.body.next_cursor).toBeNull();
    expect(list.body.data.map((c) => [c.version, c.status])).toEqual([
      [2, 'draft'],
      [1, 'voided'],
    ]);
    expect((await get('/contracts')).status).toBe(422);
    expect((await get(`/contracts?booking_id=${uuid(404)}`)).status).toBe(404);
    expect(
      (await post(`/bookings/${uuid(500)}/contracts/pandadoc`, { template: 'nda' })).status,
    ).toBe(409); // already one open
  });

  it('sends, follows the signer and ends final', async () => {
    const c = await draft();
    expect((await post(`/contracts/${c.id}/send`, {})).body).toMatchObject({
      status: 'sent',
      sent_at: expect.any(String),
      allowed_actions: ['revise', 'void', 'sign_on_screen'],
    });
    expect((await post(`/mock/contracts/${c.id}/events/viewed`, {})).body.status).toBe('viewed');
    const signed = await post(`/mock/contracts/${c.id}/events/signed`, {});
    expect(signed.body).toMatchObject({
      status: 'signed',
      signed_at: expect.any(String),
      allowed_actions: [],
    });
    expect((await post(`/contracts/${c.id}/revise`, { note: 'x' })).body.code).toBe(
      'INVALID_TRANSITION',
    );
    expect((await post(`/mock/contracts/${c.id}/events/exploded`, {})).status).toBe(422);
    expect(
      (await post(`/bookings/${uuid(500)}/contracts/pandadoc`, { template: 'sale_agreement' })).body
        .code,
    ).toBe('CONTRACT_ALREADY_SIGNED');
  });

  it('revises with a note, answering 422 without one', async () => {
    const c = await draft();
    const bad = await post(`/contracts/${c.id}/revise`, { note: ' ' });
    expect(bad.status).toBe(422);
    expect(bad.body.details).toEqual([{ field: 'note', message: 'Say what is being changed' }]);
    const next = await post(`/contracts/${c.id}/revise`, { note: 'Corrected price' });
    expect(next.body).toMatchObject({
      version: 2,
      status: 'draft',
      supersedes_id: c.id,
      revision_note: 'Corrected price',
    });
  });

  describe('uploading the signed PDF (multipart)', () => {
    it('stores the file and returns a signed upload', async () => {
      const res = await uploadPdf(sales, { title: 'Signed deed' });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(KEYS);
      expect(res.body).toMatchObject({
        kind: 'signed_upload',
        status: 'signed',
        title: 'Signed deed',
        file_name: 'signed.pdf',
        file_size: PDF.length,
        pandadoc_url: null,
        template: null,
        allowed_actions: ['void'],
      });
      expect(t.files.files.size).toBe(1);
    });
    it('replaces an open PandaDoc draft, refuses a second signed copy, allows it after a void', async () => {
      const c = await draft();
      const first = await uploadPdf();
      expect(
        (await get(`/contracts?booking_id=${uuid(500)}`)).body.data.map((x) => x.status),
      ).toEqual(['signed', 'voided']);
      expect(c.status).toBe('draft');
      const again = await uploadPdf();
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('CONTRACT_ALREADY_SIGNED');
      expect((await post(`/contracts/${first.body.id}/void`, {})).body.status).toBe('voided');
      expect((await uploadPdf(sales, { filename: 'right.pdf' })).status).toBe(201);
    });
    it('answers 422 for a non-PDF, an empty file, a disguised file or a missing one, and for a too large one', async () => {
      const text = (res) => res.body.details?.[0]?.field;
      expect(text(await uploadPdf(sales, { filename: 'scan.png', type: 'image/png' }))).toBe(
        'file',
      );
      expect(
        text(await uploadPdf(sales, { buffer: Buffer.from('<html>'), filename: 'x.pdf' })),
      ).toBe('file');
      const none = await request(t.app)
        .post(`${BASE}/bookings/${uuid(500)}/contracts/signed`)
        .set(sales)
        .field('title', 'no file');
      expect(none.status).toBe(422);
      const big = await uploadPdf(sales, {
        buffer: Buffer.concat([PDF, Buffer.alloc(MAX_FILE_BYTES)]),
      });
      expect(big.status).toBe(422);
      expect(big.body.details).toEqual([
        { field: 'file', message: 'The file must be between 1 byte and 10 MB' },
      ]);
      expect(t.files.files.size).toBe(0);
    });
    it('answers 404 for an unknown booking', async () => {
      expect((await uploadPdf(sales, { booking: uuid(404) })).status).toBe(404);
    });
  });

  it('downloads an uploaded PDF as an attachment, but nothing for an unsigned PandaDoc draft', async () => {
    const up = await uploadPdf();
    const file = await get(
      `/contracts/${up.body.id}/file`,
      await t.auth.bearer({ role: 'support' }),
    );
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/application\/pdf/);
    expect(file.headers['content-disposition']).toContain('attachment; filename="signed.pdf"');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body).equals(PDF)).toBe(true);
    const d = await buildContractTest().then(
      async (x) => ((t = x), (sales = await x.auth.bearer({ role: 'sales_manager' })), draft()),
    );
    expect((await get(`/contracts/${d.id}/file`)).body.code).toBe('NOT_SIGNED');
    expect((await get(`/contracts/${uuid(404)}/file`)).status).toBe(404);
  });

  it('shows read-only access to a sales agent, nothing to a dealer manager, and refuses every write without permission', async () => {
    const c = await draft();
    const agent = await t.auth.bearer({ role: 'sales_agent' });
    expect(
      (await get(`/contracts?booking_id=${uuid(500)}`, agent)).body.data[0].allowed_actions,
    ).toEqual([]);
    expect(
      (
        await get(
          `/contracts?booking_id=${uuid(500)}`,
          await t.auth.bearer({ role: 'dealer_manager' }),
        )
      ).status,
    ).toBe(403);
    for (const [path, body] of [
      [`/contracts/${c.id}/send`, {}],
      [`/contracts/${c.id}/void`, {}],
      [`/bookings/${uuid(500)}/contracts/pandadoc`, { template: 'sale_agreement' }],
      [`/mock/contracts/${c.id}/events/signed`, {}],
    ]) {
      expect([path, (await post(path, body, agent)).status]).toEqual([path, 403]);
    }
    expect((await uploadPdf(agent)).status).toBe(403);
  });

  it('needs a token and keeps tenants apart', async () => {
    expect((await request(t.app).get(`${BASE}/contracts?booking_id=${uuid(500)}`)).status).toBe(
      401,
    );
    const c = await draft();
    const stranger = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
    expect((await get(`/contracts?booking_id=${uuid(500)}`, stranger)).status).toBe(404);
    expect((await post(`/contracts/${c.id}/send`, {}, stranger)).status).toBe(404);
    expect((await get(`/contracts/${c.id}/file`, stranger)).status).toBe(404);
  });

  it('does not mount the mock signer route outside development', async () => {
    const { composeContract } = await import('../src/main/compose.js');
    const prod = composeContract({ ...t.deps, mockSigner: false });
    expect(
      (
        await request(prod)
          .post(`${BASE}/mock/contracts/${uuid(1)}/events/signed`)
          .set(sales)
          .send({})
      ).status,
    ).toBe(404);
  });

  it('follows booking events: learns the buyer, then voids open contracts when the booking is cancelled', async () => {
    const event = buildEvent({
      type: EVENT.BOOKING_CONFIRMED,
      tenantId: TEST_TENANT_A,
      producer: 'sales',
      data: {
        booking_id: uuid(600),
        unit: {
          id: uuid(101),
          unit_no: 'B-02',
          kind: 'plot',
          project_id: uuid(201),
          project_name: 'P',
        },
        customer: { id: uuid(302), full_name: 'Bilal', phone: null, email: 'bilal@example.test' },
        plan: { name: 'p', down_pct: 20, installment_count: 12 },
        total_price: 1000,
        currency: 'PKR',
        booked_at: '2026-10-21',
      },
    });
    expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: false });
    const c = (
      await post(`/bookings/${uuid(600)}/contracts/pandadoc`, { template: 'sale_agreement' })
    ).body;
    expect(c.signer_email).toBe('bilal@example.test');
    await deliverEvent(
      t.app,
      buildEvent({
        type: EVENT.BOOKING_CANCELLED,
        tenantId: TEST_TENANT_A,
        producer: 'sales',
        data: { booking_id: uuid(600), unit_id: uuid(101), customer_id: uuid(302) },
      }),
    );
    expect((await get(`/contracts?booking_id=${uuid(600)}`)).status).toBe(200);
    expect((await get(`/contracts?booking_id=${uuid(600)}`)).body.data[0].status).toBe('voided');
    expect((await request(t.app).post('/internal/events').send(event)).status).toBe(401);
  });
});
