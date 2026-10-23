import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A } from '@estateops/platform/testing';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { ChargeSavedCard } from '../src/payments/application/ChargeSavedCard.js';
import { CollectDueInvoices } from '../src/payments/application/CollectDueInvoices.js';
import { CreateCardSetupSession } from '../src/payments/application/CreateCardSetupSession.js';
import { GetCheckoutSession } from '../src/payments/application/GetCheckoutSession.js';
import { ProcessCollectionRequest } from '../src/payments/application/ProcessCollectionRequest.js';
import { SendPaymentEmail } from '../src/payments/application/SendPaymentEmail.js';
import {
  COLLECTION_POLICY,
  attemptKeyFor,
  decideCollection,
  nextRetry,
} from '../src/payments/domain/collectionPolicy.js';
import {
  chargeFailedEmail,
  chargeSucceededEmail,
  refundedEmail,
} from '../src/payments/domain/emailTemplates.js';
import { formatAmount } from '../src/payments/domain/formatAmount.js';
import { createConsoleMailer, createMemoryMailer, createSmtpMailer } from '@estateops/platform';
import { CONFIRMED, actor, buildBillingTest, payInCheckout, uuid } from './fakes.js';

const CUSTOMER = uuid(301);
const silent = { info() {}, warn() {}, error() {}, debug() {} };

describe('collection policy', () => {
  const h = (over = {}) => ({
    failures: 0,
    lastFailureOn: null,
    lastFailureCode: null,
    inFlight: false,
    ...over,
  });

  it('charges on the first run, then retries after 1 day and 3 more, up to three attempts', () => {
    expect(decideCollection(h(), '2026-10-21')).toEqual({
      attempt: true,
      attemptNo: 1,
      reason: 'due',
    });
    const one = h({
      failures: 1,
      lastFailureOn: '2026-10-21',
      lastFailureCode: 'insufficient_funds',
    });
    expect(decideCollection(one, '2026-10-21')).toEqual({ attempt: false, skip: 'waiting' });
    expect(decideCollection(one, '2026-10-22')).toEqual({
      attempt: true,
      attemptNo: 2,
      reason: 'retry',
    });
    const two = h({
      failures: 2,
      lastFailureOn: '2026-10-22',
      lastFailureCode: 'insufficient_funds',
    });
    expect(decideCollection(two, '2026-10-24')).toEqual({ attempt: false, skip: 'waiting' });
    expect(decideCollection(two, '2026-10-25')).toEqual({
      attempt: true,
      attemptNo: 3,
      reason: 'retry',
    });
    expect(decideCollection(h({ failures: 3, lastFailureOn: '2026-10-01' }), '2026-12-01')).toEqual(
      { attempt: false, skip: 'gave_up' },
    );
  });

  it('does not retry what waiting cannot fix, and never doubles up on a charge in flight', () => {
    for (const code of ['expired_card', 'authentication_required', 'lost_card', 'NO_ACTIVE_CARD'])
      expect(
        decideCollection(
          h({ failures: 1, lastFailureOn: '2026-01-01', lastFailureCode: code }),
          '2026-10-21',
        ).skip,
      ).toBe('needs_new_card');
    expect(decideCollection(h({ inFlight: true }), '2026-10-21')).toEqual({
      attempt: false,
      skip: 'in_flight',
    });
  });

  it('tells the customer when the next try is, or that there is none', () => {
    expect(nextRetry(1, 'insufficient_funds', '2026-10-21')).toEqual({
      willRetry: true,
      retryOn: '2026-10-22',
    });
    expect(nextRetry(2, 'generic_decline', '2026-10-31')).toEqual({
      willRetry: true,
      retryOn: '2026-11-03',
    });
    expect(nextRetry(3, 'generic_decline', '2026-10-21')).toEqual({
      willRetry: false,
      retryOn: null,
    });
    expect(nextRetry(1, 'expired_card', '2026-10-21')).toEqual({ willRetry: false, retryOn: null });
    expect(attemptKeyFor('2026-10-21', 2)).toBe('2026-10-21:2');
    expect(COLLECTION_POLICY.maxAttempts).toBe(3);
  });
});

describe('customer emails: templates and money', () => {
  const d = {
    customerName: 'Ali Raza',
    invoiceNo: 'INV-PK-000002',
    unitNo: 'A-01',
    amount: 'PKR 1,000.00',
    cardBrand: 'visa',
    cardLast4: '4242',
  };

  it('writes plain-text and HTML for each outcome, escaping what it was given', () => {
    const ok = chargeSucceededEmail({ ...d, receiptNo: 'RCT-PK-000001' });
    expect(ok.subject).toBe('Payment received for invoice INV-PK-000002');
    expect(ok.text).toContain('PKR 1,000.00 to visa ending 4242');
    expect(ok.text).toContain('RCT-PK-000001');
    const failed = chargeFailedEmail({
      ...d,
      failureMessage: 'Your card has insufficient funds.',
      willRetry: true,
      retryOn: '2026-10-22',
    });
    expect(failed.text).toContain('We will try again on 2026-10-22');
    expect(chargeFailedEmail({ ...d, failureMessage: 'x', willRetry: false }).text).toContain(
      'will not try this card again',
    );
    expect(refundedEmail(d).text).toContain('refunded PKR 1,000.00');
    expect(chargeSucceededEmail({ ...d, customerName: '<b>Eve</b>' }).html).toContain(
      '&lt;b&gt;Eve&lt;/b&gt;',
    );
    expect(chargeSucceededEmail({ ...d, cardLast4: null }).text).toContain('your saved card');
  });

  it('formats minor units by the currency’s digits without floating-point division', () => {
    expect(formatAmount(100_000, 'PKR')).toBe('PKR 1,000.00');
    expect(formatAmount(5, 'AED')).toBe('AED 0.05');
    expect(formatAmount(1500, 'JPY')).toBe('JPY 1,500');
    expect(formatAmount(1_234_567, 'KWD')).toBe('KWD 1,234.567');
    expect(formatAmount(9_007_199_254_740_991, 'USD')).toBe('USD 90,071,992,547,409.91');
  });

  it('sends through SMTP (here nodemailer’s JSON transport), logs to the console, or remembers in memory', async () => {
    const jsonTransport = (await import('nodemailer')).default.createTransport({
      jsonTransport: true,
    });
    const smtp = createSmtpMailer({ from: 'EstateOps <x@y.z>', transport: jsonTransport });
    const sent = await smtp.send({ to: 'a@b.c', subject: 'S', text: 'T', html: '<p>T</p>' });
    expect(sent.id).toBeTruthy();
    const broken = createSmtpMailer({
      from: 'x',
      transport: {
        sendMail: async () => {
          throw new Error('connection refused');
        },
      },
    });
    await expect(broken.send({ to: 'a@b.c', subject: 'S', text: 'T' })).rejects.toMatchObject({
      name: 'MailError',
      message: 'connection refused',
    });
    const lines = [];
    await createConsoleMailer({ logger: { info: (o) => lines.push(o) } }).send({
      to: 'a@b.c',
      subject: 'S',
      text: 'T',
    });
    expect(lines[0]).toMatchObject({ to: 'a@b.c', subject: 'S' });
    const memory = createMemoryMailer();
    memory.failNext('down');
    await expect(memory.send({ to: 'a@b.c' })).rejects.toThrow('down');
    await memory.send({ to: 'a@b.c', subject: 'ok' });
    expect(memory.sent).toHaveLength(1);
  });
});

describe('automatic collection', () => {
  let t;
  let finance;
  const ev = (type, data) =>
    buildEvent({ type, tenantId: TEST_TENANT_A, producer: 'x', data, now: t.clock.now() });
  const invoices = () => [...t.stores.invoices.values()].sort((a, b) => a.seq - b.seq);
  const emi = () => invoices()[1];
  const collect = () => new CollectDueInvoices(t.deps).execute();
  const requests = () => t.events.filter((e) => e.type === 'payment.collection_requested');
  const worker = () => new ProcessCollectionRequest({ ...t.deps, logger: silent });
  const email = () => new SendPaymentEmail(t.deps);
  const stripeSession = (id) => t.stores.checkouts.get(id).stripeSessionId;
  const txs = () => [...t.stores.transactions.values()].filter((x) => x.trigger === 'scheduled');
  /** Delivers every queued event of these types to billing's own handlers, as Kafka would. */
  const deliver = async (types) => {
    const out = [];
    for (const e of [...t.events].filter((x) => types.includes(x.type))) {
      if (t.delivered.has(e.id)) continue;
      t.delivered.add(e.id);
      out.push(await t.app.handlers[e.type](e));
    }
    return out;
  };

  const saveCard = async (number = '4242424242424242') => {
    const s = await new CreateCardSetupSession(t.deps).execute({
      actor: finance,
      customerId: CUSTOMER,
    });
    await payInCheckout(t, stripeSession(s.checkoutId), number);
    await new GetCheckoutSession(t.deps).execute({ actor: finance, id: s.checkoutId });
  };

  beforeEach(async () => {
    t = await buildBillingTest();
    t.delivered = new Set();
    finance = actor('finance');
    t.stores.customerRefs.set(CUSTOMER, {
      customerId: CUSTOMER,
      tenantId: TEST_TENANT_A,
      fullName: 'Ali Raza',
      phone: null,
      email: 'ali@example.test',
    });
    // booked in May: the first invoices are long due
    await new CreateSchedule(t.deps).execute(
      ev(EVENT.BOOKING_CONFIRMED, CONFIRMED({ booked_at: '2026-05-01' })),
    );
  });

  describe('the daily scan', () => {
    it('asks for a charge on every due invoice of a customer with a usable saved card, nothing else', async () => {
      expect(await collect()).toMatchObject({ scanned: 0, requested: 0 }); // no card yet
      await saveCard();
      const due = invoices().filter((i) => i.dueDate <= '2026-10-21' && i.paidAmount < i.amount);
      const result = await collect();
      expect(result).toMatchObject({ scanned: due.length, requested: due.length, retries: 0 });
      expect(
        requests()
          .map((e) => e.data.invoice_id)
          .sort(),
      ).toEqual(due.map((i) => i.id).sort());
      expect(requests()[0].data).toMatchObject({
        attempt_key: '2026-10-21:1',
        attempt_no: 1,
        reason: 'due',
        customer_id: CUSTOMER,
      });
      expect(
        invoices().filter(
          (i) => i.dueDate > '2026-10-21' && requests().some((r) => r.data.invoice_id === i.id),
        ),
      ).toEqual([]);
    });

    it('keeps a record of every decision, including due invoices that have no card to charge', async () => {
      const due = invoices().filter((i) => i.dueDate <= '2026-10-21' && i.paidAmount < i.amount);
      await collect(); // no card yet: nothing is charged, and the history says why
      const noCard = [...t.stores.attempts.values()];
      expect(noCard).toHaveLength(due.length);
      expect(noCard.every((a) => a.decision === 'skip' && a.reason === 'no_card')).toBe(true);
      expect(noCard[0]).toMatchObject({ runDate: '2026-10-21', amount: expect.any(Number) });

      await saveCard();
      await collect();
      const charged = [...t.stores.attempts.values()].filter((a) => a.decision === 'charge');
      expect(charged).toHaveLength(due.length);
      expect(charged[0]).toMatchObject({ reason: 'due', attemptNo: 1, attemptKey: '2026-10-21:1' });
      await collect(); // a repeat scan on the same day adds nothing
      expect([...t.stores.attempts.values()].filter((a) => a.decision === 'charge')).toHaveLength(
        due.length,
      );
    });

    it('skips paid invoices, expired cards and cancelled bookings', async () => {
      await saveCard();
      const first = invoices()[0];
      await new RecordPayment(t.deps).execute({
        actor: finance,
        id: first.id,
        input: { method: 'cash' },
      });
      const before = (await collect()).requested;
      expect(requests().some((e) => e.data.invoice_id === first.id)).toBe(false);
      [...t.stores.methods.values()][0].expYear = 2020;
      t.events.length = 0;
      expect(await collect()).toMatchObject({ scanned: 0, requested: 0 });
      [...t.stores.methods.values()][0].expYear = 2030;
      t.stores.bookingRefs.get(uuid(500)).status = 'cancelled';
      expect(await collect()).toMatchObject({ requested: 0 });
      expect(before).toBeGreaterThan(0);
    });

    it('can be run again the same day: the attempt keys repeat, so nothing is charged twice', async () => {
      await saveCard();
      await collect();
      const keys = requests().map((e) => `${e.data.invoice_id}:${e.data.attempt_key}`);
      await collect();
      const again = requests().map((e) => `${e.data.invoice_id}:${e.data.attempt_key}`);
      expect(new Set(again).size).toBe(keys.length);
      await deliver(['payment.collection_requested']);
      const paid = [...t.stores.payments].length;
      t.delivered.clear();
      await deliver(['payment.collection_requested']);
      expect(t.stores.payments.length).toBe(paid);
    });
  });

  describe('the payment worker', () => {
    it('charges each requested invoice to the saved card and books the payment', async () => {
      await saveCard();
      await collect();
      const outcomes = await deliver(['payment.collection_requested']);
      expect(outcomes.every((o) => o.outcome === 'paid')).toBe(true);
      expect(txs().every((x) => x.status === 'succeeded' && x.cardLast4 === '4242')).toBe(true);
      expect(emi().status).toBe('paid');
      expect(t.stripeMock.state.paymentIntents.size).toBe(outcomes.length);
    });

    it('records a declined card, schedules the retry and emails the customer', async () => {
      await saveCard('4000000000000002'.replace('4000000000000002', '4000002500003155'));
      await collect();
      await deliver(['payment.collection_requested']);
      expect(
        txs().every((x) => x.status === 'failed' && x.failureCode === 'authentication_required'),
      ).toBe(true);
      const failedEvent = t.events.find((e) => e.type === 'payment.charge_failed');
      expect(failedEvent.data).toMatchObject({
        failure_code: 'authentication_required',
        will_retry: false,
        retry_on: null,
        trigger: 'scheduled',
      });

      await deliver(['payment.charge_failed']);
      expect(t.mailer.sent).toHaveLength(txs().length);
      expect(t.mailer.sent[0]).toMatchObject({ to: 'ali@example.test' });
      expect(t.mailer.sent[0].subject).toMatch(/could not charge your card/);
      // not retried tomorrow either: the card needs the customer
      t.clock.advanceDays(1);
      t.events.length = 0;
      expect((await collect()).requested).toBe(0);
    });

    it('retries a plain decline the next day and gives up after three failures', async () => {
      await saveCard();
      const original = t.deps.gateway.chargeSavedCard;
      t.deps.gateway.chargeSavedCard = async () => ({
        ok: false,
        error: {
          code: 'card_declined',
          declineCode: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
        },
        raw: { error: 'declined' },
      });
      const one = invoices().find((i) => i.dueDate <= '2026-10-21');
      for (const i of invoices()) if (i.id !== one.id) i.status = 'waived';
      await collect();
      await deliver(['payment.collection_requested']);
      expect(txs()).toHaveLength(1);
      const day1 = t.events.find((e) => e.type === 'payment.charge_failed');
      expect(day1.data).toMatchObject({ will_retry: true, retry_on: '2026-10-22' });

      t.events.length = 0;
      expect((await collect()).requested).toBe(0); // same day: waiting
      t.clock.advanceDays(1);
      expect(await collect()).toMatchObject({ requested: 1, retries: 1 });
      await deliver(['payment.collection_requested']);
      t.clock.advanceDays(3);
      expect(await collect()).toMatchObject({ requested: 1, retries: 1 });
      await deliver(['payment.collection_requested']);
      expect(txs().map((x) => x.status)).toEqual(['failed', 'failed', 'failed']);
      const last = t.events.filter((e) => e.type === 'payment.charge_failed').at(-1);
      expect(last.data).toMatchObject({ will_retry: false });
      t.clock.advanceDays(30);
      t.events.length = 0;
      expect((await collect()).skipped.gave_up).toBe(1);
      t.deps.gateway.chargeSavedCard = original;
    });

    it('drops a request for an invoice that was paid in the meantime, and repeats safely', async () => {
      await saveCard();
      await collect();
      const request = requests().find((e) => e.data.invoice_id === emi().id);
      await new RecordPayment(t.deps).execute({
        actor: finance,
        id: emi().id,
        input: { method: 'cash' },
      });
      expect(await worker().execute(request)).toMatchObject({ outcome: 'dropped' });
      const other = requests().find((e) => e.data.invoice_id !== emi().id);
      expect((await worker().execute(other)).outcome).toBe('paid');
      expect((await worker().execute(other)).outcome).toBe('repeat');
      expect(
        await worker().execute({ ...other, data: { ...other.data, invoice_id: uuid(9999) } }),
      ).toMatchObject({ outcome: 'dropped' });
    });

    it('records a refusal when the card vanished between the scan and the charge', async () => {
      await saveCard();
      await collect();
      const request = requests()[0];
      [...t.stores.methods.values()][0].status = 'removed';
      [...t.stores.methods.values()][0].isActive = false;
      expect((await worker().execute(request)).outcome).toBe('failed');
      expect(txs()[0]).toMatchObject({ status: 'failed', failureCode: 'NO_ACTIVE_CARD' });
      expect(t.events.find((e) => e.type === 'payment.charge_failed').data).toMatchObject({
        will_retry: false,
      });
    });

    it('is the same code staff use: a staff charge is announced and emailed the same way', async () => {
      await saveCard();
      await new ChargeSavedCard(t.deps).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 300_000 },
        attemptKey: 'portal',
      });
      await deliver(['payment.charge_succeeded']);
      expect(t.mailer.sent.at(-1).subject).toBe(`Payment received for invoice ${emi().invoiceNo}`);
      expect(t.mailer.sent.at(-1).text).toContain('PKR 3,000.00');
    });
  });

  describe('emails', () => {
    const outcome = async () => {
      await saveCard();
      await new ChargeSavedCard(t.deps).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 300_000 },
        attemptKey: 'k',
      });
      return t.events.find((e) => e.type === 'payment.charge_succeeded');
    };

    it('sends once per event however often it is delivered, and logs it', async () => {
      const e = await outcome();
      await email().execute(e);
      expect((await email().execute(e)).duplicate).toBe(true);
      expect(t.mailer.sent).toHaveLength(1);
      const [row] = [...t.stores.emails.values()];
      expect(row).toMatchObject({
        template: 'charge_succeeded',
        to: 'ali@example.test',
        status: 'sent',
      });
    });

    it('raises a failed send so the event is retried, and sends nothing', async () => {
      const e = await outcome();
      t.mailer.failNext('smtp down');
      await expect(email().execute(e)).rejects.toThrow('smtp down');
      expect(t.mailer.sent).toHaveLength(0);
    });
    it('skips a customer with no email address and says so in the log', async () => {
      const e = await outcome();
      t.stores.bookingRefs.get(uuid(500)).customerEmail = null;
      await email().execute(e);
      expect(t.mailer.sent).toHaveLength(0);
      expect([...t.stores.emails.values()][0]).toMatchObject({
        status: 'skipped',
        error: 'customer has no email',
      });
    });

    it('ignores events it does not know and handles a refund notice', async () => {
      expect(
        await email().execute({
          type: 'customer.upserted',
          id: uuid(1),
          tenant_id: TEST_TENANT_A,
          data: {},
        }),
      ).toEqual({ skipped: 'unknown_event' });
      const e = await outcome();
      await email().execute({
        ...e,
        id: uuid(8888),
        type: 'payment.refunded',
        data: { ...e.data, reason: 'BALANCE_CHANGED' },
      });
      expect(t.mailer.sent.at(-1).subject).toMatch(/was refunded/);
    });
  });

  describe('over HTTP', () => {
    it('runs the scan on request through the internal job route', async () => {
      const { default: request } = await import('supertest');
      await saveCard();
      const res = await request(t.app)
        .post('/internal/jobs/collect')
        .set('x-internal-token', 'test-internal-token');
      expect(res.status).toBe(200);
      expect(res.body.requested).toBeGreaterThan(0);
      expect((await request(t.app).post('/internal/jobs/collect')).status).toBe(401);
    });
  });
});
