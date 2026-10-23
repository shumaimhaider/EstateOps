import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_TENANT_A, TEST_TENANT_B } from '@estateops/platform/testing';
import { CreateCustomer } from '../src/customers/application/CreateCustomer.js';
import { CUSTOMER, actor, buildCustomerTest } from './fakes.js';

const PORTAL = '/api/v1/portal';
const ADMIN = '/api/v1/admin';
const BOOKING = '00000000-0000-4000-8000-000000000500';

describe('customer portal: profile and support', () => {
  let t;
  let ali;
  let bilal;
  let me;
  let theirs;
  let staff;
  const portal = (method, path, body, headers = me) =>
    request(t.app)[method](`${PORTAL}${path}`).set(headers).send(body);
  const admin = (method, path, body, headers = staff) =>
    request(t.app)[method](`${ADMIN}${path}`).set(headers).send(body);
  const open = (over = {}, headers = me) =>
    portal(
      'post',
      '/support-requests',
      { subject: 'Receipt missing', message: 'I paid but have no receipt.', ...over },
      headers,
    );

  beforeEach(async () => {
    t = await buildCustomerTest();
    ali = await new CreateCustomer(t.deps).execute({
      actor: actor('owner'),
      ...CUSTOMER,
      email: 'ali@example.test',
      idNumber: '35202-1234567-1',
    });
    bilal = await new CreateCustomer(t.deps).execute({
      actor: actor('owner'),
      ...CUSTOMER,
      fullName: 'Bilal Khan',
      email: 'bilal@example.test',
      phone: '+92 301 7654321',
    });
    t.stores.summaries.set(BOOKING, {
      bookingId: BOOKING,
      tenantId: TEST_TENANT_A,
      customerId: ali.id,
      unitNo: 'A-01',
      seq: 1,
      cancelled: false,
    });
    me = await t.auth.customerBearer({
      customerId: ali.id,
      tenantId: TEST_TENANT_A,
      name: 'Ali Raza',
    });
    theirs = await t.auth.customerBearer({
      customerId: bilal.id,
      tenantId: TEST_TENANT_A,
      name: 'Bilal Khan',
    });
    staff = await t.auth.bearer({
      role: 'sales_manager',
      tenantId: TEST_TENANT_A,
      name: 'Sam Support',
    });
  });

  describe('my profile', () => {
    it('shows my own record, with the ID number masked and no money totals', async () => {
      const res = await portal('get', '/profile');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: ali.id,
        name: ali.fullName,
        email: 'ali@example.test',
        phone: expect.any(String),
        city: expect.any(String),
        preferred_language: 'en',
        id_number_masked: '*****-*******-1',
        currency: 'PKR',
      });
      expect(res.body.id_number_masked).not.toContain('1234567');
      expect(JSON.stringify(res.body)).not.toMatch(/total_value|pending|overdue|tenant_id|version/);
    });

    it('is for the signed-in customer only: staff tokens and other tenants get nothing', async () => {
      expect((await portal('get', '/profile', undefined, staff)).status).toBe(401);
      const stranger = await t.auth.customerBearer({ customerId: ali.id, tenantId: TEST_TENANT_B });
      expect((await portal('get', '/profile', undefined, stranger)).status).toBe(404);
    });
  });

  describe('opening a request', () => {
    it('creates a request with its first message, audits it and tells the support inbox', async () => {
      const res = await open({ booking_id: BOOKING });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        subject: 'Receipt missing',
        status: 'open',
        booking_id: BOOKING,
        messages: [
          { author_kind: 'customer', author_name: 'Ali Raza', body: 'I paid but have no receipt.' },
        ],
      });
      expect(t.mailer.sent).toHaveLength(1);
      expect(t.mailer.sent[0]).toMatchObject({
        to: 'support@zameen.test',
        subject: 'Customer request: Receipt missing',
      });
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'support.open' });
    });

    it('checks the text and refuses a property that is not theirs', async () => {
      expect((await open({ subject: 'x' })).status).toBe(422);
      expect((await open({ message: '   ' })).status).toBe(422);
      expect((await open({ subject: 'a'.repeat(121) })).status).toBe(422);
      expect((await open({ message: 'a'.repeat(4001) })).status).toBe(422);
      expect((await open({ booking_id: '00000000-0000-4000-8000-000000000999' })).status).toBe(404);
      expect((await open({ booking_id: BOOKING }, theirs)).status).toBe(404); // Bilal does not own it
      expect((await portal('post', '/support-requests', {})).status).toBe(422);
    });

    it('limits how many requests can be waiting at once', async () => {
      for (let i = 0; i < 10; i += 1)
        expect((await open({ subject: `Question ${i + 1}` })).status).toBe(201);
      const eleventh = await open({ subject: 'One more' });
      expect(eleventh.status).toBe(409);
      expect(eleventh.body.code).toBe('TOO_MANY_REQUESTS');
      expect((await open({ subject: 'Bilal asks' }, theirs)).status).toBe(201);
    });
  });

  describe('reading and replying as the customer', () => {
    it('lists only my own requests, newest activity first, and opens one with its messages', async () => {
      const a = (await open({ subject: 'First thing' })).body;
      t.clock; // fixed clock: ties break by id, which is fine for the order of two
      const b = (await open({ subject: 'Second thing' })).body;
      await open({ subject: 'Bilal’s question' }, theirs);
      const list = await portal('get', '/support-requests');
      expect(list.body.data.map((r) => r.subject).sort()).toEqual(['First thing', 'Second thing']);
      expect(list.body.data[0]).toMatchObject({ status: 'open', message_count: 1 });
      expect(JSON.stringify(list.body)).not.toMatch(/customer_id|customer_name|tenant_id/);
      expect((await portal('get', `/support-requests/${a.id}`)).body.messages).toHaveLength(1);
      expect((await portal('get', `/support-requests/${b.id}`, undefined, theirs)).status).toBe(
        404,
      );
      expect((await portal('get', '/support-requests/not-a-uuid')).status).toBe(404);
    });

    it('pages the list', async () => {
      for (let i = 0; i < 3; i += 1) await open({ subject: `Thing number ${i}` });
      const first = await portal('get', '/support-requests?limit=2');
      expect(first.body.data).toHaveLength(2);
      const rest = await portal(
        'get',
        `/support-requests?limit=2&cursor=${encodeURIComponent(first.body.next_cursor)}`,
      );
      expect(rest.body.data).toHaveLength(1);
      expect(rest.body.next_cursor).toBeNull();
    });

    it('adds a message to my own request, reopening it, and never to somebody else’s', async () => {
      const r = (await open()).body;
      const more = await portal('post', `/support-requests/${r.id}/messages`, {
        message: 'It is order #44.',
      });
      expect(more.status).toBe(201);
      expect(more.body.messages.map((m) => m.body)).toEqual([
        'I paid but have no receipt.',
        'It is order #44.',
      ]);
      expect(
        (await portal('post', `/support-requests/${r.id}/messages`, { message: 'hi' }, theirs))
          .status,
      ).toBe(404);
      expect(
        (await portal('post', `/support-requests/${r.id}/messages`, { message: ' ' })).status,
      ).toBe(422);
    });
  });

  describe('what staff do', () => {
    it('sees the queue with who asked and how many are waiting, and can filter and search', async () => {
      await open({ subject: 'Receipt missing' });
      await open({ subject: 'Change my phone' }, theirs);
      const queue = await admin('get', '/support-requests');
      expect(queue.status).toBe(200);
      expect(queue.body.waiting).toBe(2);
      expect(queue.body.data.map((r) => r.customer_name).sort()).toEqual([
        'Ali Raza',
        'Bilal Khan',
      ]);
      expect((await admin('get', '/support-requests?q=phone')).body.data).toHaveLength(1);
      expect((await admin('get', '/support-requests?status=closed')).body.data).toEqual([]);
      expect((await admin('get', '/support-requests?status=nonsense')).status).toBe(422);
    });

    it('replies, which marks it answered and emails the customer, and a reply from the customer reopens it', async () => {
      const r = (await open()).body;
      t.mailer.sent.length = 0;
      const reply = await admin('post', `/support-requests/${r.id}/messages`, {
        message: 'Your receipt is attached to INV-1.',
      });
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ status: 'answered', customer_name: 'Ali Raza' });
      expect(reply.body.messages.at(-1)).toMatchObject({
        author_kind: 'staff',
        author_name: 'Sam Support',
      });
      expect(t.mailer.sent).toHaveLength(1);
      expect(t.mailer.sent[0]).toMatchObject({
        to: 'ali@example.test',
        subject: 'Reply to your request: Receipt missing',
      });
      expect((await admin('get', '/support-requests')).body.waiting).toBe(0);
      const again = await portal('post', `/support-requests/${r.id}/messages`, {
        message: 'Thanks, one more thing.',
      });
      expect(again.body.status).toBe('open');
      expect((await admin('get', '/support-requests')).body.waiting).toBe(1);
    });

    it('closes and reopens a request, refuses staff replies on a closed one, and a customer message reopens it', async () => {
      const r = (await open()).body;
      expect((await admin('post', `/support-requests/${r.id}/close`)).body.status).toBe('closed');
      expect((await admin('post', `/support-requests/${r.id}/close`)).body.status).toBe('closed'); // repeat is harmless
      const refused = await admin('post', `/support-requests/${r.id}/messages`, {
        message: 'late reply',
      });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('SUPPORT_CLOSED');
      expect((await admin('post', `/support-requests/${r.id}/reopen`)).body.status).toBe('open');
      await admin('post', `/support-requests/${r.id}/close`);
      expect(
        (await portal('post', `/support-requests/${r.id}/messages`, { message: 'still broken' }))
          .body.status,
      ).toBe('open');
      expect(t.auditEntries.map((a) => a.action)).toEqual(
        expect.arrayContaining(['support.close', 'support.reopen']),
      );
    });

    it('needs customers.view to look and customers.manage to answer, and keeps tenants apart', async () => {
      const r = (await open()).body;
      const marketing = await t.auth.bearer({ role: 'marketing', tenantId: TEST_TENANT_A });
      expect((await admin('get', '/support-requests', undefined, marketing)).status).toBe(403);
      const support = await t.auth.bearer({ role: 'support', tenantId: TEST_TENANT_A });
      expect((await admin('get', '/support-requests', undefined, support)).status).toBe(200);
      for (const [path, body] of [
        [`/support-requests/${r.id}/messages`, { message: 'hello' }],
        [`/support-requests/${r.id}/close`, {}],
      ]) {
        expect((await admin('post', path, body, support)).status).toBe(403);
      }
      const other = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
      expect((await admin('get', `/support-requests/${r.id}`, undefined, other)).status).toBe(404);
      expect((await portal('get', '/support-requests', undefined, me)).status).toBe(200);
      expect((await request(t.app).get(`${ADMIN}/support-requests`).set(me)).status).toBe(401); // customers cannot use the staff queue
    });
  });
});
