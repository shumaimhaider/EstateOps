import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B, deliverEvent } from '@estateops/platform/testing';
import { CONFIRMED, buildBillingTest, uuid } from './fakes.js';

const BASE = '/api/v1/admin';
const INVOICE_KEYS = [
  'adjustment_reason',
  'allowed_actions',
  'amount',
  'balance',
  'booking_id',
  'buyer_name',
  'created_at',
  'currency',
  'days_late',
  'due_date',
  'fine_amount',
  'id',
  'invoice_no',
  'issued_on',
  'kind',
  'method',
  'original_amount',
  'paid_amount',
  'paid_at',
  'payment_reference',
  'payment_source',
  'project_name',
  'receipt_no',
  'received_on',
  'seq',
  'status',
  'tenant_id',
  'unit_kind',
  'unit_no',
  'updated_at',
];

describe('billing API', () => {
  let t;
  let finance;
  const get = (path, h = finance) => request(t.app).get(`${BASE}${path}`).set(h);
  const post = (path, body, h = finance) => request(t.app).post(`${BASE}${path}`).set(h).send(body);
  const put = (path, body, h = finance) => request(t.app).put(`${BASE}${path}`).set(h).send(body);
  const del = (path, h = finance) => request(t.app).delete(`${BASE}${path}`).set(h);
  const ev = (type, data, tenantId = TEST_TENANT_A) =>
    buildEvent({ type, tenantId, producer: 'x', data, now: t.clock.now() });
  const seed = (over = {}) =>
    deliverEvent(
      t.app,
      ev(EVENT.BOOKING_CONFIRMED, CONFIRMED({ booked_at: '2026-05-01', ...over })),
    );
  const invoices = async (query = '') =>
    (await get(`/installments?booking_id=${uuid(500)}&sort=seq:asc&limit=50${query}`)).body.data;

  beforeEach(async () => {
    t = await buildBillingTest();
    finance = await t.auth.bearer({ role: 'finance' });
    t.stores.unitRefs.set(uuid(101), {
      unitId: uuid(101),
      tenantId: TEST_TENANT_A,
      projectId: uuid(201),
      projectName: 'Gulberg Greens',
      unitNo: 'A-01',
      kind: 'plot',
      status: 'booked',
      listPrice: 1,
      currency: 'PKR',
    });
    t.stores.customerRefs.set(uuid(301), {
      customerId: uuid(301),
      tenantId: TEST_TENANT_A,
      fullName: 'Ali Raza',
    });
  });

  describe('the register', () => {
    beforeEach(() => seed());

    it('returns invoices in exactly the shape the UI parses', async () => {
      const res = await get(`/installments?booking_id=${uuid(500)}&sort=seq:asc&limit=2`);
      expect(res.status).toBe(200);
      expect(res.body.next_cursor).toEqual(expect.any(String));
      const [down] = res.body.data;
      expect(Object.keys(down).sort()).toEqual(INVOICE_KEYS);
      expect(down).toMatchObject({
        seq: 0,
        kind: 'down_payment',
        invoice_no: 'INV-PK-000001',
        unit_no: 'A-01',
        buyer_name: 'Ali Raza',
        project_name: 'Gulberg Greens',
        amount: 24_000_000,
        original_amount: 24_000_000,
        paid_amount: 0,
        balance: 24_000_000,
        fine_amount: 480_000,
        currency: 'PKR',
        status: 'overdue',
        days_late: 173,
        paid_at: null,
        payment_source: null,
        tenant_id: TEST_TENANT_A,
      });
      expect(down.allowed_actions).toEqual([
        'record_payment',
        'pay_by_card',
        'adjust_amount',
        'waive',
        'cancel',
      ]);
    });
    it('filters, sorts and pages, and reads one invoice with its payments', async () => {
      expect((await get('/installments?status=overdue')).body.data).toHaveLength(6);
      expect(
        (await get('/installments?due_from=2026-10-01&due_to=2026-10-31')).body.data,
      ).toHaveLength(1);
      expect((await get('/installments?sort=amount:desc&limit=1')).body.data[0].amount).toBe(
        24_000_000,
      );
      expect((await get('/installments?sort=nope:asc')).status).toBe(422);
      const [down] = await invoices();
      expect((await get(`/installments/${down.id}`)).body.id).toBe(down.id);
      expect((await get(`/installments/${down.id}/payments`)).body).toEqual({
        data: [],
        next_cursor: null,
      });
      expect((await get(`/installments/${uuid(404)}`)).status).toBe(404);
      expect((await get('/installments/not-a-uuid')).status).toBe(404);
    });
    it('shows a sales agent the invoices without actions and a marketing user nothing', async () => {
      const agent = await t.auth.bearer({ role: 'sales_agent' });
      expect((await get('/installments?limit=1', agent)).body.data[0].allowed_actions).toEqual([]);
      expect((await get('/installments', await t.auth.bearer({ role: 'marketing' }))).status).toBe(
        403,
      );
    });
  });

  describe('marking a payment received', () => {
    beforeEach(() => seed());

    it('records it and returns the updated invoice, with the received date and a part payment first', async () => {
      const [, emi] = await invoices();
      const part = await post(`/installments/${emi.id}/pay`, {
        method: 'bank_transfer',
        amount: 3_000_000,
        reference: 'TT-77',
        received_on: '2026-10-01',
        note: 'HBL',
      });
      expect(part.status).toBe(200);
      expect(part.body).toMatchObject({
        status: 'overdue',
        paid_amount: 3_000_000,
        balance: 5_000_000,
        method: 'bank_transfer',
        payment_source: 'manual',
        received_on: '2026-10-01',
        payment_reference: 'TT-77',
        receipt_no: null,
      });
      const rest = await post(`/installments/${emi.id}/pay`, { method: 'cheque' });
      expect(rest.body).toMatchObject({
        status: 'paid',
        balance: 0,
        receipt_no: 'RCT-PK-000002',
        allowed_actions: [],
      });
      const ledger = (await get(`/installments/${emi.id}/payments`)).body.data;
      expect(ledger.map((p) => p.amount)).toEqual([3_000_000, 5_000_000]);
      expect(ledger[0]).toMatchObject({
        source: 'manual',
        method: 'bank_transfer',
        reference: 'TT-77',
        received_on: '2026-10-01',
        recorded_by_name: 'Test User',
      });
    });
    it('adjusts the invoice amount and shows what it was', async () => {
      const [, emi] = await invoices();
      const res = await post(`/installments/${emi.id}/pay`, {
        method: 'cash',
        adjusted_amount: 7_000_000,
        adjustment_reason: 'Early settlement',
      });
      expect(res.body).toMatchObject({
        amount: 7_000_000,
        original_amount: 8_000_000,
        adjustment_reason: 'Early settlement',
        status: 'paid',
      });
    });
    it('answers 422 with field names, 409 for a state, 403 without permission, 404 for a stranger', async () => {
      const [a, b] = await invoices();
      const bad = await post(`/installments/${a.id}/pay`, {
        method: 'barter',
        amount: 9_999_999_999,
        received_on: '2099-01-01',
      });
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d) => d.field)).toEqual(['method', 'amount', 'received_on']);
      expect(
        (await post(`/installments/${a.id}/pay`, { method: 'cash', adjusted_amount: 1 })).body
          .details[0].field,
      ).toBe('adjustment_reason');
      expect(
        (await post(`/installments/${a.id}/pay`, { method: 'cash', amount: 'lots' })).status,
      ).toBe(422);
      await post(`/installments/${a.id}/pay`, { method: 'cash', reference: 'DUP-1' });
      expect(
        (await post(`/installments/${b.id}/pay`, { method: 'cash', reference: 'DUP-1' })).body
          .details[0].field,
      ).toBe('reference');
      const again = await post(`/installments/${a.id}/pay`, { method: 'cash' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('INVALID_TRANSITION');
      const manager = await t.auth.bearer({ role: 'sales_manager' });
      expect(
        (
          await post(
            `/installments/${b.id}/pay`,
            { method: 'cash', adjusted_amount: 100, adjustment_reason: 'x y z' },
            manager,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await post(
            `/installments/${b.id}/pay`,
            { method: 'cash' },
            await t.auth.bearer({ role: 'support' }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await post(
            `/installments/${b.id}/pay`,
            { method: 'cash' },
            await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B }),
          )
        ).status,
      ).toBe(404);
    });
    it('waives and cancels with invoices.adjust only', async () => {
      const [, emi, third] = await invoices();
      expect((await post(`/installments/${emi.id}/waive`, {})).body).toMatchObject({
        status: 'waived',
        balance: 0,
        allowed_actions: [],
      });
      expect((await post(`/installments/${third.id}/cancel`, {})).body.status).toBe('cancelled');
      expect((await post(`/installments/${emi.id}/cancel`, {})).status).toBe(409);
      expect(
        (
          await post(
            `/installments/${third.id}/waive`,
            {},
            await t.auth.bearer({ role: 'sales_manager' }),
          )
        ).status,
      ).toBe(403);
    });
  });

  describe('fine rates', () => {
    beforeEach(() => seed());
    const RULE_KEYS = [
      'allowed_actions',
      'currency',
      'id',
      'kind',
      'scope',
      'scope_id',
      'scope_name',
      'tenant_id',
      'unit_kind',
      'updated_at',
      'updated_by_name',
      'value',
    ];

    it('lists the default, saves a category rate, and shows the effective rate with where it comes from', async () => {
      const list = await get('/fine-rules');
      expect(list.body.data).toHaveLength(1);
      expect(Object.keys(list.body.data[0]).sort()).toEqual(RULE_KEYS);
      expect(list.body.data[0]).toMatchObject({
        scope: 'default',
        scope_id: null,
        unit_kind: null,
        kind: 'percent',
        value: 200,
        currency: 'PKR',
        allowed_actions: ['edit'],
      });
      const saved = await put('/fine-rules', {
        scope: 'project',
        scope_id: uuid(201),
        unit_kind: 'plot',
        kind: 'fixed',
        value: 500_000,
      });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({
        scope: 'project',
        scope_name: 'Gulberg Greens',
        unit_kind: 'plot',
        kind: 'fixed',
        value: 500_000,
        allowed_actions: ['edit', 'delete'],
      });
      expect((await invoices())[1].fine_amount).toBe(500_000);
      const effective = await get(`/fine-rules/effective?scope=unit&scope_id=${uuid(101)}`);
      expect(effective.body).toMatchObject({
        inherited: true,
        scope: 'unit',
        scope_id: uuid(101),
        unit_kind: null,
        allowed_actions: ['set'],
        rule: { scope: 'project', unit_kind: 'plot', scope_name: 'Gulberg Greens' },
      });
      expect(
        (await get(`/fine-rules/effective?scope=project&scope_id=${uuid(201)}&unit_kind=plot`))
          .body,
      ).toMatchObject({ inherited: false, allowed_actions: ['set', 'clear'] });
    });
    it('removes an override, but never the default', async () => {
      const saved = (
        await put('/fine-rules', { scope: 'project', scope_id: uuid(201), kind: 'fixed', value: 1 })
      ).body;
      expect((await del(`/fine-rules/${saved.id}`)).body).toEqual({ ok: true });
      expect((await invoices())[1].fine_amount).toBe(160_000);
      const def = (await get('/fine-rules')).body.data[0];
      const refused = await del(`/fine-rules/${def.id}`);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('DEFAULT_RULE_REQUIRED');
      expect((await del(`/fine-rules/${uuid(404)}`)).status).toBe(404);
    });
    it('answers 422 with field names, and 404 for an unknown target', async () => {
      const bad = await put('/fine-rules', {
        scope: 'unit',
        scope_id: uuid(101),
        unit_kind: 'shop',
        kind: 'percent',
        value: 20_000,
      });
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d) => d.field)).toEqual(['unit_kind', 'value']);
      expect(
        (
          await put('/fine-rules', {
            scope: 'project',
            scope_id: uuid(999),
            kind: 'percent',
            value: 1,
          })
        ).body.details[0].field,
      ).toBe('scope_id');
      expect((await get('/fine-rules/effective?scope=project&scope_id=' + uuid(999))).status).toBe(
        404,
      );
      expect((await get('/fine-rules/effective')).status).toBe(422);
    });
    it('lets an auditor look without any action, and refuses everyone else', async () => {
      const auditor = await t.auth.bearer({ role: 'auditor' });
      expect((await get('/fine-rules', auditor)).body.data[0].allowed_actions).toEqual([]);
      expect(
        (await put('/fine-rules', { scope: 'default', kind: 'percent', value: 1 }, auditor)).status,
      ).toBe(403);
      expect((await get('/fine-rules', await t.auth.bearer({ role: 'sales_agent' }))).status).toBe(
        403,
      );
    });
    it('re-prices the default through the event, in the background', async () => {
      await put('/fine-rules', { scope: 'default', kind: 'percent', value: 500 });
      expect((await invoices())[1].fine_amount).toBe(160_000);
      const event = t.events.findLast((e) => e.type === 'fine_rate.changed');
      expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: false });
      expect((await invoices())[1].fine_amount).toBe(400_000);
    });
  });

  describe('escalations, settings, stats and jobs', () => {
    beforeEach(() => seed());
    it('lists the escalated case and sends its one notice', async () => {
      const list = await get('/escalations');
      expect(list.body.data[0]).toMatchObject({
        id: uuid(500),
        booking_id: uuid(500),
        missed_installments: 6,
        oldest_due_date: '2026-05-01',
        days_late: 173,
        status: 'open',
        allowed_actions: ['send_notice'],
        buyer_name: 'Ali Raza',
        buyer_phone: '+92 300 1234567',
        notice_sent_at: null,
        created_by: null,
        tenant_id: TEST_TENANT_A,
      });
      const sent = await post(`/escalations/${uuid(500)}/notice`, {});
      expect(sent.body).toMatchObject({
        status: 'notice_sent',
        allowed_actions: [],
        notice_sent_at: expect.any(String),
      });
      expect((await post(`/escalations/${uuid(500)}/notice`, {})).body.code).toBe(
        'NOTICE_ALREADY_SENT',
      );
      expect((await post(`/escalations/${uuid(404)}/notice`, {})).status).toBe(404);
      expect((await get('/escalations', await t.auth.bearer({ role: 'sales_agent' }))).status).toBe(
        403,
      );
    });
    it('reads and updates collection settings', async () => {
      expect((await get('/collection-settings')).body).toEqual({
        grace_days: 5,
        escalation_missed: 3,
      });
      expect(
        (await put('/collection-settings', { grace_days: 7, escalation_missed: 4 })).body,
      ).toEqual({ grace_days: 7, escalation_missed: 4 });
      expect(
        (await put('/collection-settings', { grace_days: 99, escalation_missed: 0 })).status,
      ).toBe(422);
      expect(
        (await put('/collection-settings', { grace_days: 1, escalation_missed: 1, extra: 1 }))
          .status,
      ).toBe(422);
      expect(
        (
          await put(
            '/collection-settings',
            { grace_days: 7, escalation_missed: 4 },
            await t.auth.bearer({ role: 'auditor' }),
          )
        ).status,
      ).toBe(403);
    });
    it('serves stats behind stats.view', async () => {
      expect((await get('/stats/collections')).status).toBe(200);
      expect(
        (await get('/stats/collections', await t.auth.bearer({ role: 'sales_agent' }))).status,
      ).toBe(403);
    });
    it('runs the status sweep through the internal route, needing the internal token', async () => {
      const route = () => request(t.app).post('/internal/jobs/sweep');
      expect((await route()).status).toBe(401);
      t.clock.advanceDays(40);
      const res = await route().set('x-internal-token', 'test-internal-token');
      expect(res.body).toMatchObject({ tenants: 1 });
      expect(res.body.movedToDue + res.body.movedToOverdue).toBeGreaterThan(0);
    });
  });

  describe('through the event endpoint', () => {
    it('builds a schedule on booking.confirmed and replays harmlessly; cancels on booking.cancelled', async () => {
      const event = ev(EVENT.BOOKING_CONFIRMED, CONFIRMED());
      expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: false });
      expect((await deliverEvent(t.app, event)).body).toEqual({ ok: true, duplicate: true });
      expect(await invoices()).toHaveLength(13);
      await deliverEvent(
        t.app,
        ev(EVENT.BOOKING_CANCELLED, {
          booking_id: uuid(500),
          unit_id: uuid(101),
          customer_id: uuid(301),
        }),
      );
      expect((await invoices()).every((i) => i.status === 'cancelled')).toBe(true);
    });
    it('asks the sender to retry when the tenant is not known yet', async () => {
      t.stores.tenantRefs.clear();
      expect((await deliverEvent(t.app, ev(EVENT.BOOKING_CONFIRMED, CONFIRMED()))).status).toBe(
        500,
      );
    });
    it('gives a new tenant its defaults from tenant.upserted', async () => {
      await deliverEvent(
        t.app,
        ev(
          EVENT.TENANT_UPSERTED,
          {
            slug: 'ae',
            name: 'Desert Rose',
            currency: 'AED',
            locale: 'en-AE',
            time_zone: 'Asia/Dubai',
            area_unit: 'sq_ft',
          },
          TEST_TENANT_B,
        ),
      );
      const owner = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
      expect((await get('/fine-rules', owner)).body.data[0]).toMatchObject({
        scope: 'default',
        value: 200,
        currency: 'AED',
      });
      expect((await get('/collection-settings', owner)).body).toEqual({
        grace_days: 5,
        escalation_missed: 3,
      });
    });
    it('needs the internal token', async () => {
      expect(
        (
          await request(t.app)
            .post('/internal/events')
            .send(ev(EVENT.BOOKING_CONFIRMED, CONFIRMED()))
        ).status,
      ).toBe(401);
      expect((await request(t.app).get(`${BASE}/installments`)).status).toBe(401);
    });
  });
});
