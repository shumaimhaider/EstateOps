import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createMockPandaDoc, createMockStripe, listen, TEST_CARDS } from '../src/index.js';

const form = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v))
      return v.flatMap((item, i) =>
        typeof item === 'object' ? form(item, `${key}[${i}]`) : [[`${key}[${i}]`, item]],
      );
    return typeof v === 'object' && v !== null ? form(v, key) : [[key, String(v)]];
  });
const encode = (obj) => new URLSearchParams(form(obj)).toString();

describe('mock Stripe', () => {
  let stripe, srv, hooks, hookSrv;
  const received = [];
  const call = (path, body, method = 'POST') =>
    fetch(`${srv.url}/v1${path}`, {
      method,
      headers: {
        authorization: 'Bearer sk_test_mock',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body ? encode(body) : undefined,
    });
  const control = (path, body) =>
    fetch(`${srv.url}/_mock${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  const card = (number) => ({
    number,
    exp_month: 12,
    exp_year: new Date().getFullYear() + 2,
    cvc: '123',
  });

  beforeAll(async () => {
    hooks = (await import('express')).default();
    hooks.use((await import('express')).default.text({ type: '*/*' }));
    hooks.post('/hook', (req, res) => {
      received.push({ body: req.body, sig: req.get('stripe-signature') });
      res.sendStatus(200);
    });
    hookSrv = await listen(hooks);
    stripe = createMockStripe({ webhookUrl: `${hookSrv.url}/hook` });
    srv = await listen(stripe.app);
  });
  afterAll(async () => {
    await srv.close();
    await hookSrv.close();
  });

  it('rejects a wrong key like Stripe', async () => {
    const res = await fetch(`${srv.url}/v1/customers`, {
      method: 'POST',
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.type).toBe('invalid_request_error');
  });

  it('runs an embedded payment Checkout Session to completion and signs the webhook', async () => {
    const created = await (
      await call('/checkout/sessions', {
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: 'http://x/return?session_id={CHECKOUT_SESSION_ID}',
        line_items: [
          {
            price_data: { currency: 'pkr', unit_amount: 500000, product_data: { name: 'Invoice' } },
            quantity: 1,
          },
        ],
        payment_intent_data: { metadata: { invoiceId: 'inv-1' } },
      })
    ).json();
    expect(created).toMatchObject({
      object: 'checkout.session',
      ui_mode: 'embedded',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: 500000,
      currency: 'pkr',
    });
    expect(created.client_secret).toMatch(/^cs_test_.*_secret_/);

    const done = await (
      await control(`/checkout-sessions/${created.id}/complete`, { card: card(TEST_CARDS.VISA) })
    ).json();
    expect(done.outcome).toBe('succeeded');

    const got = await (
      await call(`/checkout/sessions/${created.id}?expand[]=payment_intent`, null, 'GET')
    ).json();
    expect(got).toMatchObject({ status: 'complete', payment_status: 'paid' });
    expect(got.payment_intent).toMatchObject({
      status: 'succeeded',
      amount_received: 500000,
      metadata: { invoiceId: 'inv-1' },
    });

    const completed = received.find(
      (r) => JSON.parse(r.body).type === 'checkout.session.completed',
    );
    const ts = /t=(\d+)/.exec(completed.sig)[1];
    expect(completed.sig).toBe(
      `t=${ts},v1=${createHmac('sha256', 'whsec_mock').update(`${ts}.${completed.body}`).digest('hex')}`,
    );
  });

  it('declines and keeps the session open', async () => {
    const s = await (
      await call('/checkout/sessions', {
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: 'http://x',
        line_items: [{ price_data: { currency: 'usd', unit_amount: 1000 }, quantity: 1 }],
      })
    ).json();
    const res = await control(`/checkout-sessions/${s.id}/complete`, {
      card: card(TEST_CARDS.INSUFFICIENT_FUNDS),
    });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatchObject({
      code: 'card_declined',
      decline_code: 'insufficient_funds',
    });
    expect((await (await call(`/checkout/sessions/${s.id}`, null, 'GET')).json()).status).toBe(
      'open',
    );
    expect(received.some((r) => JSON.parse(r.body).type === 'payment_intent.payment_failed')).toBe(
      true,
    );
  });

  it('saves a card in setup mode and charges it off-session', async () => {
    const cus = await (await call('/customers', { email: 'a@b.c', name: 'A' })).json();
    const s = await (
      await call('/checkout/sessions', {
        mode: 'setup',
        ui_mode: 'embedded',
        customer: cus.id,
        return_url: 'http://x',
      })
    ).json();
    await control(`/checkout-sessions/${s.id}/complete`, { card: card(TEST_CARDS.MASTERCARD) });
    const list = await (await call(`/customers/${cus.id}/payment_methods`, null, 'GET')).json();
    expect(list.data[0].card).toMatchObject({ brand: 'mastercard', last4: '4444' });
    const pi = await (
      await call('/payment_intents', {
        amount: 5000,
        currency: 'usd',
        customer: cus.id,
        payment_method: list.data[0].id,
        off_session: true,
        confirm: true,
      })
    ).json();
    expect(pi.status).toBe('succeeded');
    const refund = await (await call('/refunds', { payment_intent: pi.id, amount: 2000 })).json();
    expect(refund).toMatchObject({ object: 'refund', amount: 2000, status: 'succeeded' });
    const tooMuch = await call('/refunds', { payment_intent: pi.id, amount: 9000 });
    expect(tooMuch.status).toBe(400);
    const detached = await (await call(`/payment_methods/${list.data[0].id}/detach`, {})).json();
    expect(detached.customer).toBeNull();
  });

  it('returns resource_missing for unknown ids and validates input', async () => {
    const res = await call('/checkout/sessions/cs_nope', null, 'GET');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('resource_missing');
    expect(
      (await call('/checkout/sessions', { mode: 'payment', ui_mode: 'embedded', return_url: 'x' }))
        .status,
    ).toBe(400);
  });
});

describe('mock PandaDoc', () => {
  let pd, srv;
  const hits = [];
  let hookSrv;
  const api = (path, method = 'GET', body) =>
    fetch(`${srv.url}/public/v1${path}`, {
      method,
      headers: { authorization: 'API-Key pandadoc_mock_key', 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });

  beforeAll(async () => {
    const express = (await import('express')).default;
    const h = express();
    h.use(express.text({ type: '*/*' }));
    h.post('/hook', (req, res) => {
      hits.push({ body: req.body, signature: req.query.signature });
      res.sendStatus(200);
    });
    hookSrv = await listen(h);
    pd = createMockPandaDoc({
      webhookUrl: `${hookSrv.url}/hook`,
      templates: [{ id: 'tpl-1', name: 'Sale agreement' }],
    });
    srv = await listen(pd.app);
  });
  afterAll(async () => {
    await srv.close();
    await hookSrv.close();
  });

  it('creates, sends, opens a session and is signed by the signer with a signed webhook', async () => {
    expect((await fetch(`${srv.url}/public/v1/documents`)).status).toBe(401);
    const created = await api('/documents', 'POST', {
      name: 'Sale',
      template_uuid: 'tpl-1',
      recipients: [{ email: 'buyer@x.com', first_name: 'B', role: 'Buyer' }],
    });
    expect(created.status).toBe(201);
    const doc = await created.json();
    expect(doc.status).toBe('document.uploaded');
    expect((await (await api(`/documents/${doc.id}`)).json()).status).toBe('document.draft');

    expect(
      (await api(`/documents/${doc.id}/session`, 'POST', { recipient: 'buyer@x.com' })).status,
    ).toBe(409);
    expect(
      (await (await api(`/documents/${doc.id}/send`, 'POST', { subject: 's' })).json()).status,
    ).toBe('document.sent');
    expect((await api(`/documents/${doc.id}/send`, 'POST', {})).status).toBe(409);

    const session = await (
      await api(`/documents/${doc.id}/session`, 'POST', { recipient: 'buyer@x.com', lifetime: 600 })
    ).json();
    expect(session.id).toBeTruthy();
    expect(
      (await api(`/documents/${doc.id}/session`, 'POST', { recipient: 'other@x.com' })).status,
    ).toBe(400);
    expect((await fetch(`${srv.url}/s/${session.id}`)).status).toBe(200);

    await fetch(`${srv.url}/_mock/documents/${doc.id}/view`, { method: 'POST' });
    await fetch(`${srv.url}/_mock/documents/${doc.id}/sign`, { method: 'POST' });
    const statuses = hits.map((h) => JSON.parse(h.body)[0].data.status);
    expect(statuses).toEqual(['document.sent', 'document.viewed', 'document.completed']);
    for (const h of hits)
      expect(h.signature).toBe(
        createHmac('sha256', 'pandadoc_mock_shared').update(h.body).digest('hex'),
      );
    expect((await api(`/documents/${doc.id}/status`, 'POST', { status: 11 })).status).toBe(409);
  });

  it('declines, voids and validates', async () => {
    expect((await api('/documents', 'POST', { name: 'x', recipients: [] })).status).toBe(400);
    expect(
      (
        await api('/documents', 'POST', {
          name: 'x',
          template_uuid: 'nope',
          recipients: [{ email: 'a@b.c' }],
        })
      ).status,
    ).toBe(404);
    const d = await (
      await api('/documents', 'POST', { name: 'x', recipients: [{ email: 'a@b.c' }] })
    ).json();
    await api(`/documents/${d.id}/send`, 'POST', {});
    expect(
      (await (await api(`/documents/${d.id}/status`, 'POST', { status: 11 })).json()).status,
    ).toBe('document.voided');
    const e = await (
      await api('/documents', 'POST', { name: 'y', recipients: [{ email: 'a@b.c' }] })
    ).json();
    await api(`/documents/${e.id}/send`, 'POST', {});
    expect(
      (await fetch(`${srv.url}/_mock/documents/${e.id}/decline`, { method: 'POST' })).status,
    ).toBe(200);
    expect((await api(`/documents/${e.id}/download`)).headers.get('content-type')).toContain('pdf');
  });
});

describe('mock S3', () => {
  it('serves signed uploads, downloads, heads and deletes, and rejects bad or expired signatures', async () => {
    const { createMockS3 } = await import('../src/index.js');
    const { presignS3 } = await import('../../platform/src/storage/sigv4.js');
    let clock = Date.now();
    const s3 = createMockS3({ now: () => clock });
    const srv = await listen(s3.app);
    const host = new URL(srv.url).host;
    const sign = (method, key, extra = {}) =>
      `${srv.url}/estateops/${key}?${presignS3({ method, host, path: `/estateops/${key}`, region: s3.region, accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey, date: new Date(clock), expiresIn: 60, ...extra }).queryString}`;
    try {
      const put = await fetch(
        sign('PUT', 'a/b.png', { signedHeaders: { 'content-type': 'image/png' } }),
        { method: 'PUT', headers: { 'content-type': 'image/png' }, body: 'PNGDATA' },
      );
      expect(put.status).toBe(200);
      const head = await fetch(sign('HEAD', 'a/b.png'), { method: 'HEAD' });
      expect(head.headers.get('content-length')).toBe('7');
      expect(head.headers.get('content-type')).toBe('image/png');
      expect(await (await fetch(sign('GET', 'a/b.png'))).text()).toBe('PNGDATA');
      // the content type is part of the signature: a different one is refused
      const swapped = await fetch(
        sign('PUT', 'c.png', { signedHeaders: { 'content-type': 'image/png' } }),
        { method: 'PUT', headers: { 'content-type': 'text/html' }, body: 'x' },
      );
      expect(swapped.status).toBe(403);
      const tampered = (await fetch(sign('GET', 'a/b.png').replace('b.png', 'other.png'))).status;
      expect(tampered).toBe(403);
      expect((await fetch(`${srv.url}/estateops/a/b.png`)).status).toBeGreaterThanOrEqual(400);
      clock += 120_000;
      expect(
        (await fetch(sign('GET', 'a/b.png', { date: new Date(clock - 120_000) }))).status,
      ).toBe(403);
      clock -= 120_000;
      expect((await fetch(sign('DELETE', 'a/b.png'), { method: 'DELETE' })).status).toBe(204);
      expect((await fetch(sign('HEAD', 'a/b.png'), { method: 'HEAD' })).status).toBe(404);
    } finally {
      await srv.close();
    }
  });
});
