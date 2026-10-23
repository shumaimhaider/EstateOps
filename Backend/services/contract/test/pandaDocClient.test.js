import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMockPandaDoc, listen } from '@estateops/mock-providers';
import {
  assertESign,
  ProviderError,
  WebhookSignatureError,
} from '../src/contracts/application/esignPort.js';
import { createPandaDocClient } from '../src/contracts/infrastructure/PandaDocClient.js';

const TEMPLATES = { sale_agreement: 'tpl-sale', payment_plan_addendum: 'tpl-plan' };

describe('PandaDoc client against the mock PandaDoc API', () => {
  let mock, srv, client;
  const control = (path) =>
    fetch(`${srv.url}/_mock${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  const make = (over = {}) =>
    createPandaDocClient({
      apiKey: 'pandadoc_mock_key',
      sharedKey: 'pandadoc_mock_shared',
      baseUrl: srv.url,
      sessionBaseUrl: `${srv.url}/s`,
      templates: TEMPLATES,
      pollMs: 1,
      ...over,
    });

  beforeAll(async () => {
    mock = createMockPandaDoc({
      templates: [
        { id: 'tpl-sale', name: 'Sale agreement' },
        { id: 'tpl-plan', name: 'Addendum' },
      ],
    });
    srv = await listen(mock.app);
  });
  afterAll(() => srv.close());
  beforeEach(async () => {
    await control('/reset');
    client = make();
  });

  it('implements the whole port', () => {
    expect(assertESign(client)).toBe(client);
    expect(() => assertESign({})).toThrow(/missing/);
  });

  it('drafts a document from a template with the buyer as the only recipient', async () => {
    const { documentId } = await client.createDocument({
      template: 'sale_agreement',
      signerEmail: 'ali@example.test',
      signerName: 'Ali Raza Khan',
      bookingId: 'b1',
      unitNo: 'A-01',
    });
    const doc = mock.state.documents.get(documentId);
    expect(doc).toMatchObject({ template: 'tpl-sale', metadata: { booking_id: 'b1' } });
    expect(doc.recipients).toEqual([
      expect.objectContaining({
        email: 'ali@example.test',
        first_name: 'Ali',
        last_name: 'Raza Khan',
        role: 'Buyer',
      }),
    ]);
    expect(doc.tokens).toEqual(expect.arrayContaining([{ name: 'Unit.Number', value: 'A-01' }]));
    await expect(
      client.createDocument({ template: 'made_up', signerEmail: 'a@b.c' }),
    ).rejects.toMatchObject({ code: 'NO_TEMPLATE' });
  });

  it('sends, opens an embedded signing session for the buyer’s address, and follows the signer’s webhooks', async () => {
    const { documentId } = await client.createDocument({
      template: 'payment_plan_addendum',
      signerEmail: 'ali@example.test',
      signerName: 'Ali',
      bookingId: 'b1',
      unitNo: 'A',
    });
    await expect(client.createSigningSession(documentId, 'ali@example.test')).rejects.toMatchObject(
      { status: 409 },
    ); // not sent yet
    await client.sendDocument(documentId, 'ali@example.test');
    expect(mock.state.documents.get(documentId).status).toBe('document.sent');
    const session = await client.createSigningSession(documentId, 'ali@example.test', {
      lifetimeSec: 600,
    });
    expect(session).toMatchObject({
      sessionId: expect.any(String),
      url: `${srv.url}/s/${session.sessionId}`,
    });
    expect((await fetch(session.url)).status).toBe(200);
    await expect(client.createSigningSession(documentId, 'someone@else.com')).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it('waits for a freshly uploaded document to become a draft before sending', async () => {
    let polls = 0;
    const slow = make({
      fetchImpl: async (url, init) => {
        const res = await fetch(url, init);
        if (
          init.method === 'GET' &&
          String(url).endsWith('/documents/DOC') === false &&
          polls < 2 &&
          /documents\/[^/]+$/.test(String(url))
        ) {
          polls += 1;
          const body = await res.json();
          return new Response(JSON.stringify({ ...body, status: 'document.uploaded' }), {
            status: 200,
          });
        }
        return res;
      },
    });
    const { documentId } = await slow.createDocument({
      template: 'sale_agreement',
      signerEmail: 'a@b.c',
      signerName: 'A',
      bookingId: 'b',
      unitNo: 'U',
    });
    await slow.sendDocument(documentId, 'a@b.c');
    expect(polls).toBe(2);
    expect(mock.state.documents.get(documentId).status).toBe('document.sent');
    const never = make({
      pollTries: 2,
      fetchImpl: async (url, init) =>
        init.method === 'GET'
          ? new Response(JSON.stringify({ status: 'document.uploaded' }), { status: 200 })
          : fetch(url, init),
    });
    await expect(never.sendDocument(documentId, 'a@b.c')).rejects.toMatchObject({
      code: 'NOT_READY',
    });
    const odd = make({
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'document.completed' }), { status: 200 }),
    });
    await expect(odd.sendDocument(documentId, 'a@b.c')).rejects.toMatchObject({ status: 409 });
  });

  it('voids a document and downloads the signed PDF', async () => {
    const { documentId } = await client.createDocument({
      template: 'sale_agreement',
      signerEmail: 'a@b.c',
      signerName: 'A',
      bookingId: 'b',
      unitNo: 'U',
    });
    const pdf = await client.downloadDocument(documentId);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await client.voidDocument(documentId);
    expect(mock.state.documents.get(documentId).status).toBe('document.voided');
    // already voided, or gone: nothing left to void, so it is not an error
    await expect(client.voidDocument(documentId)).resolves.toBeUndefined();
    await expect(client.voidDocument('nope')).resolves.toBeUndefined();
    await expect(make({ apiKey: 'wrong' }).voidDocument(documentId)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('maps provider failures to ProviderError', async () => {
    const wrong = make({ apiKey: 'wrong' });
    await expect(
      wrong.createDocument({ template: 'sale_agreement', signerEmail: 'a@b.c', signerName: 'A' }),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      wrong.createDocument({ template: 'sale_agreement', signerEmail: 'a@b.c', signerName: 'A' }),
    ).rejects.toMatchObject({ status: 401 });
    const gone = make({ baseUrl: 'http://127.0.0.1:1' });
    await expect(gone.voidDocument('x')).rejects.toMatchObject({ code: 'UNREACHABLE' });
    await expect(
      client.createDocument({ template: 'sale_agreement', signerEmail: '', signerName: 'A' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('webhook signatures', () => {
    const sign = (body, key = 'pandadoc_mock_shared') =>
      createHmac('sha256', key).update(body).digest('hex');
    const body = JSON.stringify([
      {
        event: 'document_state_changed',
        data: { id: 'doc1', status: 'document.completed', date_modified: '2026-10-21T10:00:00Z' },
      },
      { event: 'recipient_completed', data: { id: 'doc1' } },
      { event: 'document_state_changed', data: { id: 'doc2', status: 'document.viewed' } },
    ]);

    it('accepts a correctly signed body and keeps only document state changes', () => {
      expect(client.verifyWebhook(Buffer.from(body), sign(body))).toEqual([
        { documentId: 'doc1', status: 'document.completed', at: '2026-10-21T10:00:00Z' },
        { documentId: 'doc2', status: 'document.viewed', at: null },
      ]);
      expect(client.verifyWebhook(body, sign(body))).toHaveLength(2);
    });

    it('refuses a wrong key, a changed body, a missing signature and a body that is not JSON', () => {
      expect(() => client.verifyWebhook(Buffer.from(body), sign(body, 'other'))).toThrow(
        WebhookSignatureError,
      );
      expect(() => client.verifyWebhook(Buffer.from(`${body} `), sign(body))).toThrow(
        WebhookSignatureError,
      );
      expect(() => client.verifyWebhook(Buffer.from(body), '')).toThrow(WebhookSignatureError);
      expect(() => client.verifyWebhook(Buffer.from('nope'), sign('nope'))).toThrow(/not JSON/);
    });
  });
});
