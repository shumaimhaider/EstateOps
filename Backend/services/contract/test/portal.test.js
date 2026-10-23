import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_TENANT_A, TEST_TENANT_B } from '@estateops/platform/testing';
import { PDF, buildContractTest, uuid } from './fakes.js';

const PORTAL = '/api/v1/portal';
const ADMIN = '/api/v1/admin';
const ME = uuid(301);
const MY_BOOKING = uuid(500);
const THEIR_BOOKING = uuid(600);
const OTHER = uuid(302);

describe('customer portal: contracts', () => {
  let t;
  let me;
  let sales;
  const portal = (method, path, body, headers = me) =>
    request(t.app)[method](`${PORTAL}${path}`).set(headers).send(body);
  const admin = (method, path, body) =>
    request(t.app)[method](`${ADMIN}${path}`).set(sales).send(body);
  const create = async (booking = MY_BOOKING) =>
    (await admin('post', `/bookings/${booking}/contracts/pandadoc`, { template: 'sale_agreement' }))
      .body;
  const sent = async (booking) => {
    const draft = await create(booking);
    await admin('post', `/contracts/${draft.id}/send`, {});
    return draft;
  };

  beforeEach(async () => {
    t = await buildContractTest();
    t.stores.bookingRefs.set(THEIR_BOOKING, {
      bookingId: THEIR_BOOKING,
      tenantId: TEST_TENANT_A,
      customerId: OTHER,
      customerName: 'Bilal Khan',
      customerEmail: 'bilal@example.test',
      unitNo: 'B-07',
      cancelled: false,
    });
    me = await t.auth.customerBearer({ customerId: ME, tenantId: TEST_TENANT_A });
    sales = await t.auth.bearer({ role: 'sales_manager' });
  });

  it('shows a customer the contracts of their own property that are out for signing, never drafts', async () => {
    const out = await create();
    expect((await portal('get', `/properties/${MY_BOOKING}/contracts`)).body.data).toEqual([]); // still a draft
    await admin('post', `/contracts/${out.id}/send`, {});
    const res = await portal('get', `/properties/${MY_BOOKING}/contracts`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: out.id,
        booking_id: MY_BOOKING,
        title: 'Sale agreement',
        kind: 'pandadoc',
        status: 'sent',
        version: 1,
        sent_at: expect.any(String),
        signed_at: null,
        can_sign: true,
        can_download: false,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(
      /signer_email|pandadoc_document_id|created_by|tenant_id|allowed_actions/,
    );
  });

  it('gives an embedded signing session for their own contract only', async () => {
    const mine = await sent();
    const res = await portal('post', `/contracts/${mine.id}/signing-session`);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      contract_id: mine.id,
      url: expect.stringMatching(/^https:\/\/sign\.test\/s\//),
      expires_at: expect.any(String),
    });
    expect(t.esign.documents.get(mine.pandadoc_document_id).sessions[0].signerEmail).toBe(
      'ali@example.test',
    );

    const theirs = await sent(THEIR_BOOKING);
    for (const id of [theirs.id, uuid(999)])
      expect((await portal('post', `/contracts/${id}/signing-session`)).status).toBe(404);
    expect((await portal('get', `/properties/${THEIR_BOOKING}/contracts`)).status).toBe(404);
    // a draft that is not theirs does not even say it is a draft
    const draftOfTheirs = await create(THEIR_BOOKING).catch(() => null);
    if (draftOfTheirs)
      expect((await portal('post', `/contracts/${draftOfTheirs.id}/signing-session`)).status).toBe(
        404,
      );
  });

  it('refuses to sign what is not out for signing, once it is signed, or in another tenant', async () => {
    const draft = await create();
    expect((await portal('post', `/contracts/${draft.id}/signing-session`)).status).toBe(409);
    await admin('post', `/contracts/${draft.id}/send`, {});
    await request(t.app)
      .post(`${ADMIN}/mock/contracts/${draft.id}/events/signed`)
      .set(sales)
      .send({});
    expect((await portal('post', `/contracts/${draft.id}/signing-session`)).status).toBe(409);
    const stranger = await t.auth.customerBearer({ customerId: ME, tenantId: TEST_TENANT_B });
    expect(
      (await portal('post', `/contracts/${draft.id}/signing-session`, undefined, stranger)).status,
    ).toBe(404);
  });

  it('lets the customer download the signed copy of their own contract, not before it is signed', async () => {
    const out = await sent();
    expect((await portal('get', `/contracts/${out.id}/file`)).body.code).toBe('NOT_SIGNED');
    await request(t.app)
      .post(`${ADMIN}/mock/contracts/${out.id}/events/signed`)
      .set(sales)
      .send({});
    const file = await portal('get', `/contracts/${out.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['content-disposition']).toContain('attachment');
    const theirs = await sent(THEIR_BOOKING);
    await request(t.app)
      .post(`${ADMIN}/mock/contracts/${theirs.id}/events/signed`)
      .set(sales)
      .send({});
    expect((await portal('get', `/contracts/${theirs.id}/file`)).status).toBe(404);
  });

  it('serves an uploaded signed PDF to its customer too', async () => {
    const res = await request(t.app)
      .post(`${ADMIN}/bookings/${MY_BOOKING}/contracts/signed`)
      .set(sales)
      .attach('file', PDF, { filename: 'agreement.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const list = (await portal('get', `/properties/${MY_BOOKING}/contracts`)).body.data;
    expect(list[0]).toMatchObject({
      kind: 'signed_upload',
      status: 'signed',
      can_download: true,
      can_sign: false,
    });
    const file = await portal('get', `/contracts/${res.body.id}/file`);
    expect(file.status).toBe(200);
  });

  it('keeps staff and customer sign-ins apart', async () => {
    expect(
      (await portal('get', `/properties/${MY_BOOKING}/contracts`, undefined, sales)).status,
    ).toBe(401);
    expect(
      (await request(t.app).get(`${ADMIN}/contracts?booking_id=${MY_BOOKING}`).set(me)).status,
    ).toBe(401);
    const staffOnlyMock = await request(t.app)
      .post(`${ADMIN}/mock/contracts/${uuid(1)}/events/signed`)
      .set(me)
      .send({});
    expect(staffOnlyMock.status).toBe(401);
  });
});
