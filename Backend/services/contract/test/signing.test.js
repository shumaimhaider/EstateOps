import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMockPandaDoc, listen } from '@estateops/mock-providers';
import { createPandaDocClient } from '../src/contracts/infrastructure/PandaDocClient.js';
import { createFakeESignProvider } from '../src/contracts/infrastructure/FakeESignProvider.js';
import { buildContractTest, uuid } from './fakes.js';

const BASE = '/api/v1/admin';

describe('signing PandaDoc contracts, end to end', () => {
  let mock, mockSrv, app, appSrv, t, sales;
  const api = (method, path, body, headers = sales) =>
    request(t.app)[method](`${BASE}${path}`).set(headers).send(body);
  const signer = (path, id) =>
    fetch(`${mockSrv.url}/_mock/documents/${id}/${path}`, { method: 'POST' });
  const create = async () =>
    (await api('post', `/bookings/${uuid(500)}/contracts/pandadoc`, { template: 'sale_agreement' }))
      .body;
  const sendIt = async (id) => (await api('post', `/contracts/${id}/send`, {})).body;
  const stored = (id) => [...t.stores.contracts.values()].find((c) => c.id === id);
  const waitFor = async (fn) => {
    for (let i = 0; i < 40; i += 1) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timed out waiting');
  };

  beforeAll(async () => {
    mock = createMockPandaDoc({
      templates: [
        { id: 'tpl-sale', name: 'Sale' },
        { id: 'tpl-plan', name: 'Plan' },
      ],
    });
    mockSrv = await listen(mock.app);
  });
  afterAll(async () => {
    await mockSrv.close();
  });
  beforeEach(async () => {
    await fetch(`${mockSrv.url}/_mock/reset`, { method: 'POST' });
    const esign = createPandaDocClient({
      apiKey: 'pandadoc_mock_key',
      sharedKey: 'pandadoc_mock_shared',
      baseUrl: mockSrv.url,
      sessionBaseUrl: `${mockSrv.url}/s`,
      templates: { sale_agreement: 'tpl-sale', payment_plan_addendum: 'tpl-plan' },
      pollMs: 1,
    });
    t = await buildContractTest({ esign });
    sales = await t.auth.bearer({ role: 'sales_manager' });
    // PandaDoc posts its webhooks to our service, exactly as in production
    appSrv = await listen(t.app);
    await fetch(`${mockSrv.url}/_mock/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ webhookUrl: `${appSrv.url}/webhooks/pandadoc` }),
    });
    app = appSrv;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('drafts, sends, lets the buyer sign on screen, and learns it from PandaDoc’s signed webhook', async () => {
    const draft = await create();
    expect(draft).toMatchObject({
      status: 'draft',
      kind: 'pandadoc',
      signer_email: 'ali@example.test',
    });
    const sent = await sendIt(draft.id);
    expect(sent.status).toBe('sent');
    const doc = mock.state.documents.get(draft.pandadoc_document_id);
    expect(doc).toMatchObject({ status: 'document.sent', template: 'tpl-sale' });

    const session = await api('post', `/contracts/${draft.id}/signing-session`);
    expect(session.status).toBe(201);
    expect(session.body).toEqual({
      contract_id: draft.id,
      url: expect.stringContaining(`${mockSrv.url}/s/`),
      expires_at: expect.any(String),
    });

    await signer('view', doc.id);
    await waitFor(() => stored(draft.id).status === 'viewed');
    await signer('sign', doc.id);
    await waitFor(() => stored(draft.id).status === 'signed');
    expect(stored(draft.id).signedAt).toBeTruthy();
    expect(mock.state.deliveries.every((d) => d.status === 200)).toBe(true);

    const final = (await api('get', `/contracts?booking_id=${uuid(500)}`)).body.data[0];
    expect(final).toMatchObject({ status: 'signed', allowed_actions: [] });
    expect(
      t.events.filter((e) => e.type === 'contract.status_changed').map((e) => e.data.status),
    ).toEqual(['draft', 'sent', 'viewed', 'signed']);
    expect(t.auditEntries.map((a) => a.action)).toEqual(
      expect.arrayContaining(['contract.viewed', 'contract.signed']),
    );

    const pdf = await api('get', `/contracts/${draft.id}/file`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('records a decline from the signer, and then lets staff revise', async () => {
    const draft = await create();
    await sendIt(draft.id);
    const id = draft.pandadoc_document_id;
    await signer('decline', id);
    await waitFor(() => stored(draft.id).status === 'declined');
    const revised = await api('post', `/contracts/${draft.id}/revise`, { note: 'Price corrected' });
    expect(revised.status).toBe(200);
    expect(revised.body).toMatchObject({ status: 'draft', version: 2 });
    // the declined version had nothing left to void at PandaDoc, and the new draft is a new document
    expect(revised.body.pandadoc_document_id).not.toBe(id);
    expect(mock.state.documents.get(id).status).toBe('document.declined');
  });

  it('voids at PandaDoc when staff void, and ignores the echo of its own void', async () => {
    const draft = await create();
    await sendIt(draft.id);
    const voided = await api('post', `/contracts/${draft.id}/void`, {});
    expect(voided.body.status).toBe('voided');
    expect(mock.state.documents.get(draft.pandadoc_document_id).status).toBe('document.voided');
    await waitFor(() => mock.state.deliveries.length >= 2);
    expect(stored(draft.id).status).toBe('voided');
  });

  it('does not let a late or repeated event undo a signed contract', async () => {
    const draft = await create();
    await sendIt(draft.id);
    const id = draft.pandadoc_document_id;
    await signer('sign', id);
    await waitFor(() => stored(draft.id).status === 'signed');
    const body = JSON.stringify([
      { event: 'document_state_changed', data: { id, status: 'document.declined' } },
    ]);
    const bad = await request(t.app)
      .post('/webhooks/pandadoc')
      .query({ signature: 'nope' })
      .set('content-type', 'application/json')
      .send(body);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('BAD_SIGNATURE');
    const signature = mock.sign(body);
    const late = await request(t.app)
      .post('/webhooks/pandadoc')
      .query({ signature })
      .set('content-type', 'application/json')
      .send(body);
    expect(late.body).toEqual({ received: true, applied: 0 });
    expect(stored(draft.id).status).toBe('signed');
  });

  it('ignores documents it does not know and statuses it has no use for', async () => {
    const body = JSON.stringify([
      {
        event: 'document_state_changed',
        data: { id: 'doc_unknown', status: 'document.completed' },
      },
      { event: 'document_state_changed', data: { id: 'doc_unknown', status: 'document.sent' } },
    ]);
    const res = await request(t.app)
      .post('/webhooks/pandadoc')
      .query({ signature: mock.sign(body) })
      .set('content-type', 'application/json')
      .send(body);
    expect(res.body).toEqual({ received: true, applied: 0 });
    const outcomes = await t.app.applyProviderEvents.execute([
      { documentId: 'doc_unknown', status: 'document.completed' },
      { documentId: 'doc_unknown', status: 'document.sent' },
    ]);
    expect(outcomes.map((o) => o.outcome)).toEqual(['unknown_document', 'ignored']);
  });

  it('refuses a signing session for a draft, a finished contract, an upload, or without permission', async () => {
    const draft = await create();
    expect((await api('post', `/contracts/${draft.id}/signing-session`)).status).toBe(409);
    await sendIt(draft.id);
    expect(
      (
        await api(
          'post',
          `/contracts/${draft.id}/signing-session`,
          {},
          await t.auth.bearer({ role: 'sales_agent' }),
        )
      ).status,
    ).toBe(403);
    await signer('sign', draft.pandadoc_document_id);
    await waitFor(() => stored(draft.id).status === 'signed');
    expect((await api('post', `/contracts/${draft.id}/signing-session`)).status).toBe(409);
    expect((await api('post', `/contracts/${uuid(999)}/signing-session`)).status).toBe(404);
    expect(
      (await request(t.app).post(`${BASE}/contracts/${draft.id}/signing-session`)).status,
    ).toBe(401);
  });

  it('keeps a customer to their own contracts when they sign through the portal', async () => {
    const draft = await create();
    await sendIt(draft.id);
    const { CreateSigningSession } =
      await import('../src/contracts/application/CreateSigningSession.js');
    const use = new CreateSigningSession({ uow: t.deps.uow, esign: t.deps.esign });
    const mine = {
      tenantId: t.deps.tenantId ?? sales.tenantId,
      customerId: uuid(301),
      permissions: [],
    };
    const actorOf = { ...mine, tenantId: (await t.stores.contracts.get(draft.id)).tenantId };
    const own = await use.execute({ actor: actorOf, id: draft.id, via: 'customer' });
    expect(own.url).toContain('/s/');
    await expect(
      use.execute({ actor: { ...actorOf, customerId: uuid(302) }, id: draft.id, via: 'customer' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('the in-memory provider matches the port', () => {
  it('signs and verifies its own webhooks', () => {
    const esign = createFakeESignProvider();
    const { body, signature } = esign.signWebhook([['doc1', 'document.completed']]);
    expect(esign.verifyWebhook(body, signature)).toEqual([
      { documentId: 'doc1', status: 'document.completed', at: null },
    ]);
    expect(() => esign.verifyWebhook(body, 'bad')).toThrow();
  });
});
