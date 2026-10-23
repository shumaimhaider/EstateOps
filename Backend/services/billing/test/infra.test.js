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
  createMemoryMailer,
} from '@estateops/platform';
import {
  createTestAuth,
  createTestDatabase,
  deliverEvent,
  postgresAvailable,
} from '@estateops/platform/testing';
import { composeBilling } from '../src/main/compose.js';
import { ENTITIES, buildRepos } from '../src/main/repos.js';
import { ApplyTenant } from '../src/refs/application/ApplyTenant.js';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { CreateCheckoutSession } from '../src/payments/application/CreateCheckoutSession.js';
import { GetCheckoutSession } from '../src/payments/application/GetCheckoutSession.js';
import { HandleStripeEvent } from '../src/payments/application/HandleStripeEvent.js';
import { CollectDueInvoices } from '../src/payments/application/CollectDueInvoices.js';
import {
  ListCollectionAttempts,
  ListCollectionRuns,
} from '../src/payments/application/CollectionHistory.js';
import { CreateCardSetupSession } from '../src/payments/application/CreateCardSetupSession.js';
import { ProcessCollectionRequest } from '../src/payments/application/ProcessCollectionRequest.js';
import { SendPaymentEmail } from '../src/payments/application/SendPaymentEmail.js';
import { ChargeSavedCard } from '../src/payments/application/ChargeSavedCard.js';
import { SweepStatuses } from '../src/jobs/application/SweepStatuses.js';
import { SendNotice } from '../src/escalations/application/SendNotice.js';
import { GetCollectionStats } from '../src/stats/application/GetCollectionStats.js';
import { createStripeGateway } from '../src/payments/infrastructure/StripeGateway.js';
import { createRule, fineFor, resolveRule } from '../src/fines/domain/rule.js';
import { summarizeInvoices } from '../src/installments/domain/summary.js';
import { toInvoice } from '../src/installments/infrastructure/InstallmentRepositoryTypeorm.js';
import { CONFIRMED, actor, movableClock, payInCheckout, sharedStripeMock, uuid } from './fakes.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[billing db tests] no PostgreSQL reachable: skipping\n');

/** A small deterministic random generator so cross-check failures are reproducible. */
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

describe.skipIf(!available)('billing on PostgreSQL', () => {
  let db;
  let ds;
  let uow;
  const clock = movableClock();
  const run = (work) => uow.run(work);
  const KINDS = ['plot', 'flat', 'villa', 'shop'];

  /** A fresh tenant with currency, default settings and the default 2% fine rate (via the real consumer). */
  async function tenant(slug = `t${newId().slice(0, 6)}`) {
    const tenantId = newId();
    await new ApplyTenant({ uow }).execute(
      buildEvent({
        type: EVENT.TENANT_UPSERTED,
        tenantId,
        producer: 'identity',
        data: {
          slug,
          name: slug,
          currency: 'PKR',
          locale: 'en-PK',
          time_zone: 'Asia/Karachi',
          area_unit: 'marla',
        },
      }),
    );
    return {
      tenantId,
      finance: actor('finance', { tenantId, userId: newId() }),
      owner: actor('owner', { tenantId, userId: newId() }),
    };
  }
  const confirmEvent = (tenantId, over = {}) =>
    buildEvent({
      type: EVENT.BOOKING_CONFIRMED,
      tenantId,
      producer: 'sales',
      data: CONFIRMED({
        booking_id: newId(),
        unit: {
          id: newId(),
          unit_no: `U-${newId().slice(0, 5)}`,
          kind: 'plot',
          project_id: newId(),
          project_name: 'P',
        },
        customer: { id: newId(), full_name: 'Ali', phone: null, email: null },
        ...over,
      }),
    });
  const schedule = async (tenantId, over = {}) => {
    const event = confirmEvent(tenantId, over);
    await new CreateSchedule({ uow, clock }).execute(event);
    return event.data;
  };
  const invoicesOf = (bookingId) =>
    ds
      .query('SELECT * FROM billing.installment WHERE booking_id = $1 ORDER BY seq', [bookingId])
      .then((rows) => rows.map(toInvoice));
  const eventsOf = (tenantId, type) =>
    ds
      .query(
        'SELECT payload FROM billing.outbox WHERE tenant_id = $1 AND type = $2 ORDER BY created_at, id',
        [tenantId, type],
      )
      .then((r) => r.map((x) => x.payload));

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: ENTITIES, poolSize: 20 }));
    uow = createTypeormUow({ dataSource: ds, schema: 'billing', buildRepos });
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  describe('constraints the database enforces', () => {
    it('refuses an invoice that is over-paid, "paid" without being paid in full, or numbered twice', async () => {
      const { tenantId } = await tenant();
      const d = await schedule(tenantId);
      const [first, second] = await invoicesOf(d.booking_id);
      const sql = (set, id = first.id) =>
        ds.query(`UPDATE billing.installment SET ${set} WHERE id = $1`, [id]);
      await expect(sql('paid_amount = amount + 1')).rejects.toMatchObject({
        driverError: { constraint: 'installment_paid_within_amount_chk' },
      });
      await expect(sql("status = 'paid'")).rejects.toMatchObject({
        driverError: { constraint: 'installment_paid_state_chk' },
      });
      await expect(sql("status = 'frozen'")).rejects.toMatchObject({
        driverError: { constraint: 'installment_status_chk' },
      });
      await expect(sql('amount = 0')).rejects.toMatchObject({
        driverError: { constraint: 'installment_amount_chk' },
      });
      await expect(sql(`invoice_no = '${first.invoiceNo}'`, second.id)).rejects.toMatchObject({
        driverError: { constraint: 'installment_invoice_no_uq' },
      });
      await expect(sql('seq = 0', second.id)).rejects.toMatchObject({
        driverError: { constraint: 'installment_booking_seq_uq' },
      });
    });

    it('keeps payment references unique per tenant and a card intent to one payment', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [a, b] = await invoicesOf(d.booking_id);
      await new RecordPayment({ uow, clock }).execute({
        actor: finance,
        id: a.id,
        input: { method: 'cash', reference: 'REF-1' },
      });
      await expect(
        new RecordPayment({ uow, clock }).execute({
          actor: finance,
          id: b.id,
          input: { method: 'cash', reference: 'REF-1' },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        ds.query(
          `INSERT INTO billing.payment (id, tenant_id, installment_id, booking_id, amount, method, source, reference, received_on) VALUES ($1, $2, $3, $4, 1, 'cash', 'manual', 'REF-1', '2026-10-21')`,
          [newId(), tenantId, b.id, d.booking_id],
        ),
      ).rejects.toMatchObject({ driverError: { constraint: 'payment_reference_uq' } });
      await expect(
        ds.query(
          `INSERT INTO billing.payment (id, tenant_id, installment_id, booking_id, amount, method, source, reference, received_on) VALUES ($1, $2, $3, $4, 1, 'card', 'stripe', 'X', '2026-10-21')`,
          [newId(), tenantId, b.id, d.booking_id],
        ),
      ).rejects.toMatchObject({ driverError: { constraint: 'payment_card_chk' } });
    });

    it('keeps one fine rate per level and category, and the rule shapes valid', async () => {
      const { tenantId } = await tenant();
      const insert = (over) =>
        run((r) =>
          r.fines.insert(
            createRule({
              tenantId,
              scope: 'project',
              scopeId: uuid(201),
              unitKind: null,
              kind: 'percent',
              value: 100,
              ...over,
            }),
            'T',
          ),
        );
      await insert({});
      await expect(insert({})).rejects.toMatchObject({ code: 'FINE_RULE_EXISTS' });
      await expect(insert({ unitKind: 'shop' })).resolves.toBeTruthy();
      await expect(
        run((r) =>
          r.fines.insert(createRule({ tenantId, scope: 'default', kind: 'fixed', value: 1 }), 'T'),
        ),
      ).rejects.toMatchObject({ code: 'FINE_RULE_EXISTS' });
      for (const [sql, constraint] of [
        [
          `INSERT INTO billing.fine_rule (id, tenant_id, scope, scope_id, kind, value) VALUES ($1, $2, 'project', NULL, 'percent', 1)`,
          'fine_scope_target_chk',
        ],
        [
          `INSERT INTO billing.fine_rule (id, tenant_id, scope, scope_id, unit_kind, kind, value) VALUES ($1, $2, 'unit', '${uuid(5)}', 'shop', 'percent', 1)`,
          'fine_unit_scope_chk',
        ],
        [
          `INSERT INTO billing.fine_rule (id, tenant_id, scope, scope_id, kind, value) VALUES ($1, $2, 'project', '${uuid(6)}', 'percent', 10001)`,
          'fine_percent_chk',
        ],
      ])
        await expect(ds.query(sql, [newId(), tenantId])).rejects.toMatchObject({
          driverError: { constraint },
        });
    });
  });

  describe('schedule and numbering', () => {
    it('builds the schedule in the database with consecutive invoice numbers and a booking snapshot', async () => {
      const { tenantId } = await tenant('pk');
      const d = await schedule(tenantId);
      const list = await invoicesOf(d.booking_id);
      expect(list).toHaveLength(13);
      expect(list.map((i) => i.invoiceNo).slice(0, 2)).toEqual(['INV-PK-000001', 'INV-PK-000002']);
      expect(list[0]).toMatchObject({
        kind: 'down_payment',
        amount: 24_000_000,
        dueDate: '2026-10-21',
        issuedOn: '2026-10-21',
        status: 'scheduled',
      });
      expect(list.reduce((a, i) => a + i.amount, 0)).toBe(120_000_000);
      const second = await schedule(tenantId);
      expect((await invoicesOf(second.booking_id))[0].invoiceNo).toBe('INV-PK-000014');
    });

    it('hands out unique, gap-free numbers to parallel callers, and gives them back on rollback', async () => {
      const { tenantId } = await tenant();
      const taken = await Promise.all(
        Array.from({ length: 25 }, () => run((r) => r.counters.next(tenantId, 'probe', 1))),
      );
      expect(new Set(taken).size).toBe(25);
      expect(Math.min(...taken)).toBe(1);
      expect(Math.max(...taken)).toBe(25);
      await expect(
        run(async (r) => {
          await r.counters.next(tenantId, 'probe', 5);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await run((r) => r.counters.next(tenantId, 'probe', 1))).toBe(26);
    });

    it('creates one schedule when the same booking.confirmed arrives twice at once', async () => {
      const { tenantId } = await tenant();
      const event = confirmEvent(tenantId);
      const results = await Promise.allSettled(
        [1, 2, 3].map(() => new CreateSchedule({ uow, clock }).execute(event)),
      );
      expect(results.every((r) => r.status === 'fulfilled' || r.reason)).toBe(true);
      expect(await invoicesOf(event.data.booking_id)).toHaveLength(13);
      expect(
        (await eventsOf(tenantId, 'schedule.created')).filter(
          (e) => e.data.booking_id === event.data.booking_id,
        ),
      ).toHaveLength(1);
    });
  });

  describe('SQL against the domain (cross-checks)', () => {
    it('the booking summary SQL equals summarizeInvoices on random invoice sets', async () => {
      const rand = lcg(7);
      const { tenantId } = await tenant();
      for (let round = 0; round < 15; round += 1) {
        const d = await schedule(tenantId, {
          plan: { name: 'p', down_pct: 10, installment_count: 20 },
        });
        const rows = await invoicesOf(d.booking_id);
        for (const row of rows) {
          const status = pick(rand, ['scheduled', 'due', 'overdue', 'paid', 'waived', 'cancelled']);
          const paid =
            status === 'paid'
              ? row.amount
              : status === 'scheduled' || status === 'cancelled'
                ? 0
                : Math.floor(rand() * row.amount);
          await ds.query(
            'UPDATE billing.installment SET status = $2, paid_amount = $3, fine_amount = $4, due_date = ($5::date + $6::int) WHERE id = $1',
            [
              row.id,
              status,
              paid,
              Math.floor(rand() * 5000),
              row.dueDate,
              Math.floor(rand() * 400) - 200,
            ],
          );
        }
        const threshold = 1 + Math.floor(rand() * 5);
        const sql = await run((r) => r.summaries.compute(tenantId, d.booking_id, threshold));
        expect(sql, `round ${round}`).toEqual(
          summarizeInvoices(await invoicesOf(d.booking_id), threshold),
        );
      }
    });

    it('the fine-pricing SQL picks the same rule as resolveRule on random rule sets', async () => {
      const rand = lcg(11);
      const projects = [newId(), newId()];
      const customers = [newId(), newId(), newId()];
      const units = Array.from({ length: 10 }, (_, i) => ({
        id: newId(),
        projectId: projects[i % 2],
        kind: KINDS[i % 4],
      }));
      for (let round = 0; round < 6; round += 1) {
        const { tenantId } = await tenant();
        const candidates = [
          { scope: 'default', scopeId: null, unitKind: 'shop', kind: 'percent', value: 600 },
          { scope: 'default', scopeId: null, unitKind: 'plot', kind: 'fixed', value: 6_000 },
          { scope: 'project', scopeId: projects[0], unitKind: null, kind: 'percent', value: 500 },
          { scope: 'project', scopeId: projects[0], unitKind: 'flat', kind: 'fixed', value: 4_000 },
          {
            scope: 'project',
            scopeId: projects[1],
            unitKind: 'villa',
            kind: 'percent',
            value: 450,
          },
          { scope: 'unit', scopeId: units[3].id, unitKind: null, kind: 'fixed', value: 3_000 },
          { scope: 'unit', scopeId: units[6].id, unitKind: null, kind: 'percent', value: 350 },
          { scope: 'customer', scopeId: customers[1], unitKind: null, kind: 'percent', value: 700 },
          {
            scope: 'customer',
            scopeId: customers[1],
            unitKind: 'villa',
            kind: 'fixed',
            value: 1_000,
          },
          {
            scope: 'customer',
            scopeId: customers[2],
            unitKind: 'plot',
            kind: 'percent',
            value: 100,
          },
        ];
        for (const c of candidates.filter(() => rand() < 0.55))
          await run((r) => r.fines.insert(createRule({ tenantId, ...c }), 'T'));
        const rules = await run((r) => r.fines.list(tenantId));

        const bookingId = newId();
        await run((r) =>
          r.bookingRefs.insert({
            bookingId,
            tenantId,
            customerId: customers[0],
            customerName: 'x',
            customerPhone: null,
            customerEmail: null,
            unitId: units[0].id,
            unitNo: 'U',
            unitKind: 'plot',
            projectId: projects[0],
            projectName: 'P',
            totalPrice: 1,
            currency: 'PKR',
            planName: 'p',
            status: 'active',
            bookedAt: '2026-01-01',
          }),
        );
        const ids = [];
        for (let i = 0; i < 40; i += 1) {
          const unit = pick(rand, units);
          const customerId = pick(rand, customers);
          const id = newId();
          ids.push({ id, unit, customerId, amount: 1_000 + Math.floor(rand() * 90_000_000) });
          await ds.query(
            `INSERT INTO billing.installment (id, tenant_id, booking_id, seq, kind, invoice_no, issued_on, due_date, amount, original_amount, status, project_id, customer_id, unit_id, unit_kind)
             VALUES ($1, $2, $3, $4, 'emi', $5, '2026-01-01', '2026-02-01', $6, $6, 'overdue', $7, $8, $9, $10)`,
            [
              id,
              tenantId,
              bookingId,
              i,
              `INV-X-${newId()}`,
              ids.at(-1).amount,
              unit.projectId,
              customerId,
              unit.id,
              unit.kind,
            ],
          );
        }
        await run((r) =>
          r.fines.repriceIds(
            tenantId,
            ids.map((x) => x.id),
          ),
        );
        const stored = new Map(
          (
            await ds.query(
              'SELECT id, fine_amount FROM billing.installment WHERE booking_id = $1',
              [bookingId],
            )
          ).map((r) => [r.id, r.fine_amount]),
        );
        for (const { id, unit, customerId, amount } of ids) {
          const expected = fineFor(
            resolveRule(rules, {
              customerId,
              unitId: unit.id,
              projectId: unit.projectId,
              unitKind: unit.kind,
            }),
            amount,
          );
          expect(stored.get(id), `round ${round} invoice ${id}`).toBe(expected);
        }
      }
    });

    it('prices a fine with exact half-up rounding on a very large amount, and only on overdue invoices', async () => {
      const { tenantId } = await tenant();
      const d = await schedule(tenantId, {
        booked_at: '2026-05-01',
        total_price: 9_000_000_000_000_000,
        plan: { name: 'p', down_pct: 50, installment_count: 2 },
      });
      const rows = await invoicesOf(d.booking_id);
      expect(rows[0].fineAmount).toBe(90_000_000_000_000); // 2% of 4.5e15
      const scheduled = rows.find((r) => r.status === 'scheduled');
      if (scheduled) expect(scheduled.fineAmount).toBe(0);
    });
  });

  describe('payments', () => {
    it('serialises two people paying one invoice: one wins, the other is refused, the amount is exact', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [, emi] = await invoicesOf(d.booking_id);
      const pay = () =>
        new RecordPayment({ uow, clock }).execute({
          actor: finance,
          id: emi.id,
          input: { method: 'cash' },
        });
      const results = await Promise.allSettled([pay(), pay(), pay()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((x) => x.status === 'rejected'))
        expect(r.reason).toMatchObject({ code: 'INVALID_TRANSITION' });
      const payments = await ds.query(
        'SELECT amount FROM billing.payment WHERE installment_id = $1',
        [emi.id],
      );
      expect(payments).toEqual([{ amount: emi.amount }]);
    });

    it('lets parallel part payments add up to exactly the balance and never beyond it', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [, emi] = await invoicesOf(d.booking_id);
      const part = emi.amount / 4;
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          new RecordPayment({ uow, clock }).execute({
            actor: finance,
            id: emi.id,
            input: { method: 'cash', amount: part },
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
      const [row] = await ds.query(
        'SELECT status, paid_amount, amount FROM billing.installment WHERE id = $1',
        [emi.id],
      );
      expect(row).toMatchObject({ status: 'paid', paid_amount: emi.amount });
    });

    const stripeSetup = async () => {
      const mock = await sharedStripeMock();
      await fetch(`${mock.url}/_mock/reset`, { method: 'POST' });
      const gateway = createStripeGateway({
        secretKey: 'sk_test_mock',
        webhookSecret: 'whsec_mock',
        apiBase: mock.url,
        maxNetworkRetries: 0,
      });
      const stripe = {
        publishableKey: 'pk_test',
        returnUrl: 'http://app.test/return?c={CHECKOUT_ID}',
      };
      return { mock, gateway, stripe, deps: { uow, clock, gateway, stripe } };
    };
    const withCustomer = async (tenantId, d) =>
      ds.query(
        "INSERT INTO billing.customer_ref (customer_id, tenant_id, full_name, email) VALUES ($1, $2, 'Ali Raza', 'ali@example.test') ON CONFLICT DO NOTHING",
        [d.customer.id, tenantId],
      );

    it('books a Checkout card payment exactly once under parallel webhook and return-page replays, all rows committed together', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      await withCustomer(tenantId, d);
      const [, emi] = await invoicesOf(d.booking_id);
      const { mock, deps } = await stripeSetup();
      const created = await new CreateCheckoutSession(deps).execute({
        actor: finance,
        id: emi.id,
        input: { amount: 1_000_000 },
      });
      const [{ stripe_session_id: sid }] = await ds.query(
        'SELECT stripe_session_id FROM billing.checkout_session WHERE id = $1',
        [created.checkoutId],
      );
      expect((await payInCheckout({ stripeMock: mock }, sid)).body.outcome).toBe('succeeded');
      const completed = mock.state.events.find((e) => e.type === 'checkout.session.completed');

      const ret = () =>
        new GetCheckoutSession(deps).execute({ actor: finance, id: created.checkoutId });
      const hook = () => new HandleStripeEvent(deps).execute(completed);
      const results = await Promise.allSettled([ret(), hook(), ret(), hook(), ret()]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      const payments = await ds.query(
        'SELECT source, stripe_intent_id, amount FROM billing.payment WHERE installment_id = $1',
        [emi.id],
      );
      expect(payments).toEqual([
        { source: 'stripe', stripe_intent_id: expect.stringMatching(/^pi_/), amount: 1_000_000 },
      ]);
      const [tx] = await ds.query(
        'SELECT status, stripe_charge_id, card_last4, stripe_response, payment_id FROM billing.payment_transaction WHERE checkout_session_id = $1',
        [created.checkoutId],
      );
      expect(tx).toMatchObject({
        status: 'succeeded',
        card_last4: '4242',
        payment_id: expect.any(String),
      });
      expect(tx.stripe_response.checkout_session).toMatchObject({
        object: 'checkout.session',
        status: 'complete',
      });
      expect((await invoicesOf(d.booking_id))[1].paidAmount).toBe(1_000_000);
      expect(
        (await eventsOf(tenantId, 'payment.recorded')).filter(
          (e) => e.data.installment_id === emi.id,
        ),
      ).toHaveLength(1);
      const events = await ds.query('SELECT status FROM billing.stripe_event WHERE id = $1', [
        completed.id,
      ]);
      expect(events).toEqual([{ status: 'processed' }]);
    });

    it('enforces one active card per customer, one row per physical card, and one attempt per idempotency key', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [, emi] = await invoicesOf(d.booking_id);
      const cust = d.customer.id;
      const pm = (n, active, fp) =>
        ds.query(
          `INSERT INTO billing.payment_method (id, tenant_id, customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, fingerprint, is_active)
           VALUES ($1, $2, $3, $4, 'visa', '4242', 12, 2030, $5, $6)`,
          [uuid(7000 + n), tenantId, cust, `pm_${n}_${tenantId.slice(-4)}`, fp, active],
        );
      await pm(1, true, 'fp-a');
      await expect(pm(2, true, 'fp-b')).rejects.toMatchObject({
        driverError: { constraint: 'pm_one_active_uq' },
      });
      await expect(pm(3, false, 'fp-a')).rejects.toMatchObject({
        driverError: { constraint: 'pm_fingerprint_uq' },
      });
      await pm(4, false, 'fp-c');
      await expect(
        ds.query("UPDATE billing.payment_method SET status = 'removed' WHERE id = $1", [
          uuid(7001),
        ]),
      ).rejects.toMatchObject({ driverError: { constraint: 'pm_active_needs_status_chk' } });

      const insertTx = (key) =>
        ds.query(
          `INSERT INTO billing.payment_transaction (id, tenant_id, installment_id, booking_id, customer_id, trigger, amount, currency, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, 'scheduled', 100, 'PKR', $6)`,
          [uuid(Math.floor(Math.random() * 1e9)), tenantId, emi.id, d.booking_id, cust, key],
        );
      await insertTx('k1');
      await expect(insertTx('k1')).rejects.toMatchObject({
        driverError: { constraint: 'tx_idem_uq' },
      });
      await expect(
        ds.query(
          "UPDATE billing.payment_transaction SET status = 'exploded' WHERE tenant_id = $1",
          [tenantId],
        ),
      ).rejects.toMatchObject({ driverError: { constraint: 'tx_status_chk' } });
      expect(finance).toBeTruthy();
    });

    it('charges a saved card once even when the same attempt is sent in parallel', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      await withCustomer(tenantId, d);
      const [, emi] = await invoicesOf(d.booking_id);
      const { mock, deps } = await stripeSetup();
      const setup = await new (
        await import('../src/payments/application/CreateCardSetupSession.js')
      ).CreateCardSetupSession(deps).execute({
        actor: finance,
        customerId: d.customer.id,
      });
      const [{ stripe_session_id: sid }] = await ds.query(
        'SELECT stripe_session_id FROM billing.checkout_session WHERE id = $1',
        [setup.checkoutId],
      );
      await payInCheckout({ stripeMock: mock }, sid);
      await new GetCheckoutSession(deps).execute({ actor: finance, id: setup.checkoutId });

      const charge = () =>
        new ChargeSavedCard(deps).execute({
          actor: finance,
          id: emi.id,
          input: { amount: 500_000 },
          attemptKey: 'attempt-1',
        });
      const results = await Promise.allSettled([charge(), charge(), charge()]);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
      const payments = await ds.query(
        'SELECT amount FROM billing.payment WHERE installment_id = $1',
        [emi.id],
      );
      expect(payments).toEqual([{ amount: 500_000 }]);
      const txs = await ds.query(
        "SELECT status FROM billing.payment_transaction WHERE installment_id = $1 AND trigger = 'staff_saved_card'",
        [emi.id],
      );
      expect(txs).toEqual([{ status: 'succeeded' }]);
    });

    it('collects due invoices through the queue exactly once, emails each outcome once, and a failed send is retried', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, {
        booked_at: '2026-05-01',
        customer: { id: newId(), full_name: 'Ali Raza', phone: null, email: 'ali@example.test' },
      });
      await withCustomer(tenantId, d);
      const { mock, deps } = await stripeSetup();
      const mailer = createMemoryMailer();
      const setup = await new CreateCardSetupSession(deps).execute({
        actor: finance,
        customerId: d.customer.id,
      });
      const [{ stripe_session_id: sid }] = await ds.query(
        'SELECT stripe_session_id FROM billing.checkout_session WHERE id = $1',
        [setup.checkoutId],
      );
      await payInCheckout({ stripeMock: mock }, sid);
      await new GetCheckoutSession(deps).execute({ actor: finance, id: setup.checkoutId });

      // the scan covers every tenant in the database; this test follows its own tenant's requests
      const scan = () => new CollectDueInvoices(deps).execute();
      await scan();
      await scan(); // a second replica scanning the same day
      const queue = await eventsOf(tenantId, 'payment.collection_requested');
      const unique = new Map(queue.map((e) => [`${e.data.invoice_id}:${e.data.attempt_key}`, e]));
      const due = (await invoicesOf(d.booking_id)).filter((i) => i.dueDate <= '2026-10-21');
      expect(unique.size).toBe(due.length); // duplicate requests share their attempt keys
      expect(queue).toHaveLength(due.length * 2);

      const worker = new ProcessCollectionRequest({ ...deps, logger: silentLogger });
      const results = await Promise.all([...queue, ...queue].map((e) => worker.execute(e)));
      expect(results.filter((r) => r.outcome === 'paid')).toHaveLength(due.length);
      expect(results.filter((r) => r.outcome === 'repeat')).toHaveLength(
        queue.length * 2 - due.length,
      );
      const charged = await ds.query(
        "SELECT status, count(*)::int AS n FROM billing.payment_transaction WHERE trigger = 'scheduled' AND tenant_id = $1 GROUP BY status",
        [tenantId],
      );
      expect(charged).toEqual([{ status: 'succeeded', n: due.length }]);
      expect(mock.state.paymentIntents.size).toBe(due.length);

      const outcomes = await eventsOf(tenantId, 'payment.charge_succeeded');
      expect(outcomes).toHaveLength(due.length);
      const mailDeps = { uow, clock, mailer };
      const sendMail = (e) => new SendPaymentEmail(mailDeps).execute(e);
      mailer.failNext('smtp down');
      await expect(sendMail(outcomes[0])).rejects.toThrow('smtp down');
      expect(
        await ds.query('SELECT 1 FROM billing.email_log WHERE event_id = $1', [outcomes[0].id]),
      ).toHaveLength(0); // rolled back with the event
      await Promise.all([
        sendMail(outcomes[0]),
        sendMail(outcomes[0]),
        ...outcomes.slice(1).map(sendMail),
      ]);
      expect(mailer.sent).toHaveLength(outcomes.length);
      const logged = await ds.query(
        'SELECT status, count(*)::int AS n FROM billing.email_log WHERE tenant_id = $1 GROUP BY status',
        [tenantId],
      );
      expect(logged).toEqual([{ status: 'sent', n: outcomes.length }]);

      // the day's history reads the ledger the worker wrote: every charged invoice, once, as paid
      const history = new ListCollectionAttempts({ uow, clock });
      const day = await history.execute({ actor: finance, runDate: '2026-10-21' });
      expect(day.items).toHaveLength(due.length);
      expect(day.items.every((a) => a.status === 'succeeded' && a.funds === 'sufficient')).toBe(
        true,
      );
      expect(day.items[0]).toMatchObject({ customerName: 'Ali Raza', attemptNo: 1, reason: 'due' });
      expect(day.summary).toMatchObject({ succeeded: due.length, failed: 0, skipped: 0 });
      const runs = await new ListCollectionRuns({ uow }).execute({ actor: finance });
      expect(runs.items[0]).toMatchObject({ runDate: '2026-10-21' });
      const onlyFailed = await history.execute({
        actor: finance,
        runDate: '2026-10-21',
        status: 'failed',
      });
      expect(onlyFailed.items).toEqual([]);
    });

    it('lets one replica claim the daily job and lists only invoices that can be charged', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      await withCustomer(tenantId, d);
      const { deps } = await stripeSetup();
      const list = () =>
        uow.read((r) => r.collection.listCollectable('2026-10-21', { limit: 100 }));
      expect((await list()).filter((r) => r.tenantId === tenantId)).toEqual([]); // no saved card yet

      await ds.query(
        `INSERT INTO billing.payment_method (id, tenant_id, customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, fingerprint, is_active)
         VALUES ($1, $2, $3, $4, 'visa', '4242', 12, 2030, 'fp', true)`,
        [uuid(7700), tenantId, d.customer.id, `pm_collect_${tenantId.slice(-6)}`],
      );
      const rows = (await list()).filter((r) => r.tenantId === tenantId);
      const due = (await invoicesOf(d.booking_id)).filter((i) => i.dueDate <= '2026-10-21');
      expect(rows.map((r) => r.invoiceId).sort()).toEqual(due.map((i) => i.id).sort());
      expect(rows[0]).toMatchObject({ failures: 0, inFlight: false, lastFailureOn: null });
      const page = await uow.read((r) =>
        r.collection.listCollectable('2026-10-21', { after: rows[0].invoiceId, limit: 2 }),
      );
      expect(page.every((r) => r.invoiceId > rows[0].invoiceId)).toBe(true);

      await ds.query(
        'UPDATE billing.payment_method SET exp_year = 2026, exp_month = 9 WHERE id = $1',
        [uuid(7700)],
      );
      expect((await list()).filter((r) => r.tenantId === tenantId)).toEqual([]); // expired in September

      const claims = await Promise.all(
        [1, 2, 3].map(() => uow.run((r) => r.jobRuns.claim('collect', '2030-01-01'))),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      await uow.run((r) => r.jobRuns.finish('collect', '2030-01-01', { result: { requested: 3 } }));
      expect(
        await ds.query(
          "SELECT result FROM billing.job_run WHERE job = 'collect' AND run_date = '2030-01-01'",
        ),
      ).toEqual([{ result: { requested: 3 } }]);
      await uow.run((r) => r.jobRuns.release('collect', '2030-01-01'));
      expect(await uow.run((r) => r.jobRuns.claim('collect', '2030-01-01'))).toBe(true);
      expect(finance).toBeTruthy();
      expect(deps).toBeTruthy();
    });

    it('rolls back everything when a payment fails part-way: no ledger row, no event, no receipt number used', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [a, b] = await invoicesOf(d.booking_id);
      await new RecordPayment({ uow, clock }).execute({
        actor: finance,
        id: a.id,
        input: { method: 'cash', reference: 'ONCE' },
      });
      const before = {
        events: (await eventsOf(tenantId, 'payment.recorded')).length,
        counter: await ds.query(
          `SELECT value FROM billing.counter WHERE tenant_id = $1 AND name = 'payment'`,
          [tenantId],
        ),
      };
      // the planning rejects a reused reference, so also force a late database failure with a stale version
      await expect(
        new RecordPayment({ uow, clock }).execute({
          actor: finance,
          id: b.id,
          input: { method: 'cash', reference: 'ONCE' },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect((await eventsOf(tenantId, 'payment.recorded')).length).toBe(before.events);
      expect(
        await ds.query(
          `SELECT value FROM billing.counter WHERE tenant_id = $1 AND name = 'payment'`,
          [tenantId],
        ),
      ).toEqual(before.counter);
      expect((await invoicesOf(d.booking_id))[1].paidAmount).toBe(0);
    });
  });

  describe('the register', () => {
    it('sorts and pages by date, amount, balance (computed), status, invoice number and sequence', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const rows = await invoicesOf(d.booking_id);
      await new RecordPayment({ uow, clock }).execute({
        actor: finance,
        id: rows[2].id,
        input: { method: 'cash', amount: 100 },
      });
      await ds.query(`UPDATE billing.installment SET status = 'waived' WHERE id = $1`, [
        rows[3].id,
      ]);
      for (const sort of [
        'due_date:asc',
        'due_date:desc',
        'amount:desc',
        'balance:asc',
        'balance:desc',
        'status:asc',
        'invoice_no:desc',
        'seq:desc',
      ]) {
        const seen = [];
        let cursor;
        do {
          const page = await run((r) =>
            r.installments.list(tenantId, { bookingId: d.booking_id, sort, cursor, limit: 4 }),
          );
          seen.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(seen, sort).toHaveLength(13);
        expect(new Set(seen.map((v) => v.invoice.id)).size).toBe(13);
      }
      const byBalance = (
        await run((r) =>
          r.installments.list(tenantId, {
            bookingId: d.booking_id,
            sort: 'balance:desc',
            limit: 50,
          }),
        )
      ).items.map((v) =>
        ['waived', 'cancelled'].includes(v.invoice.status)
          ? 0
          : v.invoice.amount - v.invoice.paidAmount,
      );
      expect(byBalance).toEqual([...byBalance].sort((a, b) => b - a));
    });

    it('filters by status, customer, project, category, date range and text, within the tenant', async () => {
      const a = await tenant();
      const b = await tenant();
      const d = await schedule(a.tenantId, {
        booked_at: '2026-05-01',
        unit: {
          id: newId(),
          unit_no: 'SHOP-9',
          kind: 'shop',
          project_id: uuid(777),
          project_name: 'Mall Plaza',
        },
      });
      await schedule(b.tenantId, { booked_at: '2026-05-01' });
      const list = (f) =>
        run((r) => r.installments.list(a.tenantId, { limit: 200, ...f })).then((p) =>
          p.items.map((v) => v.invoice),
        );
      expect((await list({ status: 'overdue' })).length).toBe(6);
      expect((await list({ projectId: uuid(777) })).length).toBe(13);
      expect((await list({ unitKind: 'shop' })).length).toBe(13);
      expect((await list({ unitKind: 'plot' })).length).toBe(0);
      expect(
        (await list({ customerId: d.customer.id, dueFrom: '2026-06-01', dueTo: '2026-06-30' }))
          .length,
      ).toBe(1);
      expect((await list({ q: 'shop-9' })).length).toBe(13);
      expect((await list({ q: 'ali' })).length).toBe(13);
      expect((await list({ q: '%' })).length).toBe(0);
      expect(await run((r) => r.installments.findView(b.tenantId, (r2) => r2))).toBeNull();
    });
  });

  describe('the daily sweep', () => {
    it('moves invoices by date and grace, prices fines, and two sweeps in parallel never move one invoice twice', async () => {
      const { tenantId } = await tenant();
      const bookings = [];
      for (let i = 0; i < 4; i += 1)
        bookings.push(await schedule(tenantId, { booked_at: '2026-10-21' }));
      const later = movableClock('2026-12-30T09:00:00.000Z');
      const sweepA = new SweepStatuses({ uow, clock: later });
      const sweepB = new SweepStatuses({ uow, clock: later });
      const [a, b] = await Promise.all([
        sweepA.execute({ batchSize: 7 }),
        sweepB.execute({ batchSize: 7 }),
      ]);
      const moved = (r) => r.movedToDue + r.movedToOverdue;
      const mine = await ds.query(
        'SELECT status, version, fine_amount, amount FROM billing.installment WHERE tenant_id = $1',
        [tenantId],
      );
      expect(mine).toHaveLength(4 * 13);
      // the sweep is global, so its counters include other tenants; this tenant has 3 late invoices per booking
      const swept = mine.filter((r) => r.status !== 'scheduled');
      expect(swept).toHaveLength(4 * 3);
      expect(moved(a) + moved(b)).toBeGreaterThanOrEqual(swept.length);
      // each swept invoice changed once for its status and once for its fine: never moved twice by two sweeps
      expect(Math.max(...swept.map((r) => r.version))).toBeLessThanOrEqual(3);
      expect(
        swept.every((r) => r.status === 'overdue' && r.fine_amount === Math.round(r.amount * 0.02)),
      ).toBe(true);
      expect(await sweepA.execute()).toMatchObject({ movedToDue: 0, movedToOverdue: 0 });
      expect((await eventsOf(tenantId, 'booking.summary_changed')).length).toBeGreaterThan(
        bookings.length,
      );
    });

    it('applies the status exactly at the grace boundary', async () => {
      const { tenantId } = await tenant();
      const d = await schedule(tenantId, {
        booked_at: '2026-10-21',
        plan: { name: 'p', down_pct: 100, installment_count: 1 },
      });
      const sweepOn = (iso) => new SweepStatuses({ uow, clock: movableClock(iso) }).execute();
      await sweepOn('2026-10-21T09:00:00.000Z');
      expect((await invoicesOf(d.booking_id))[0].status).toBe('scheduled');
      await sweepOn('2026-10-22T09:00:00.000Z');
      expect((await invoicesOf(d.booking_id))[0].status).toBe('due');
      await sweepOn('2026-10-26T09:00:00.000Z');
      expect((await invoicesOf(d.booking_id))[0].status).toBe('due');
      await sweepOn('2026-10-27T09:00:00.000Z');
      expect((await invoicesOf(d.booking_id))[0].status).toBe('overdue');
    });
  });

  describe('escalations', () => {
    it('finds bookings at the threshold, oldest first, and sends exactly one notice', async () => {
      const { tenantId, finance } = await tenant();
      const old = await schedule(tenantId, { booked_at: '2026-03-01' });
      const recent = await schedule(tenantId, { booked_at: '2026-06-01' });
      await schedule(tenantId, { booked_at: '2026-10-01' });
      const page = await run((r) => r.escalations.list(tenantId, 3, { limit: 10 }));
      expect(page.items.map((e) => e.bookingId)).toEqual([old.booking_id, recent.booking_id]);
      expect(page.items[0]).toMatchObject({
        missedInstallments: 8,
        oldestDueDate: '2026-03-01',
        buyerName: 'Ali',
        noticeSentAt: null,
      });
      expect(page.items[0].overdueAmount).toBe(24_000_000 + 7 * 8_000_000);
      expect(
        (await run((r) => r.escalations.list(tenantId, 8, { limit: 10 }))).items.map(
          (e) => e.bookingId,
        ),
      ).toEqual([old.booking_id]);

      const notice = new SendNotice({ uow, clock });
      await notice.execute({ actor: finance, bookingId: old.booking_id });
      await expect(
        notice.execute({ actor: finance, bookingId: old.booking_id }),
      ).rejects.toMatchObject({ code: 'NOTICE_ALREADY_SENT' });
      expect(
        (await run((r) => r.escalations.findOne(tenantId, old.booking_id, 3))).noticeSentAt,
      ).toBeTruthy();
      const parallel = await Promise.allSettled([
        notice.execute({ actor: finance, bookingId: recent.booking_id }),
        notice.execute({ actor: finance, bookingId: recent.booking_id }),
      ]);
      expect(parallel.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });

  describe('collection stats', () => {
    it('sums the same invoices the register lists: totals, months, ageing buckets and projects agree', async () => {
      const { tenantId, finance } = await tenant();
      const projectA = { id: newId(), name: 'Alpha' };
      const projectB = { id: newId(), name: 'Beta' };
      for (const p of [projectA, projectB])
        await run((r) =>
          r.projectRefs.upsert(
            { projectId: p.id, tenantId, name: p.name, kind: 'tower' },
            '2026-10-01T00:00:00Z',
          ),
        );
      const mkUnit = async (project, kind, status) => {
        const unitId = newId();
        await run((r) =>
          r.unitRefs.upsert(
            {
              unitId,
              tenantId,
              projectId: project.id,
              projectName: project.name,
              unitNo: `U-${unitId.slice(0, 4)}`,
              kind,
              status,
              listPrice: 1,
              currency: 'PKR',
            },
            '2026-10-01T00:00:00Z',
          ),
        );
        return unitId;
      };
      await mkUnit(projectA, 'plot', 'available');
      await mkUnit(projectA, 'shop', 'held');
      await mkUnit(projectB, 'plot', 'blocked');
      const soldA = await mkUnit(projectA, 'plot', 'sold');
      const bookedB = await mkUnit(projectB, 'flat', 'booked');
      const a = await schedule(tenantId, {
        booked_at: '2026-05-01',
        plan: { name: 'p', down_pct: 10, installment_count: 6 },
        unit: {
          id: soldA,
          unit_no: 'A',
          kind: 'plot',
          project_id: projectA.id,
          project_name: 'Alpha',
        },
        total_price: 700_000,
      });
      const b = await schedule(tenantId, {
        booked_at: '2026-09-01',
        plan: { name: 'p', down_pct: 20, installment_count: 4 },
        unit: {
          id: bookedB,
          unit_no: 'B',
          kind: 'flat',
          project_id: projectB.id,
          project_name: 'Beta',
        },
        total_price: 400_000,
      });
      const [first] = await invoicesOf(a.booking_id);
      await new RecordPayment({ uow, clock }).execute({
        actor: finance,
        id: first.id,
        input: { method: 'cash' },
      });

      const stats = (projectId) =>
        new GetCollectionStats({ uow, clock }).execute({ actor: finance, projectId });
      const all = await stats(null);
      const register = await ds
        .query('SELECT * FROM billing.installment WHERE tenant_id = $1', [tenantId])
        .then((rows) => rows.map(toInvoice));
      const active = register.filter(
        (i) => !['waived', 'cancelled', 'rescheduled'].includes(i.status),
      );
      expect(all.summary).toMatchObject({
        totalSaleValue: 1_100_000,
        bookingsCount: 2,
        receivedAmount: register.reduce((s, i) => s + i.paidAmount, 0),
        pendingAmount: active.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
        overdueAmount: register
          .filter((i) => i.status === 'overdue')
          .reduce((s, i) => s + (i.amount - i.paidAmount), 0),
        fineAmount: register.reduce((s, i) => s + i.fineAmount, 0),
        installmentsTotal: active.length,
        installmentsPaid: 1,
        installmentsOverdue: register.filter((i) => i.status === 'overdue').length,
        unitsTotal: 5,
        unitsAvailable: 1,
        unitsBooked: 1,
        unitsSold: 1,
      });
      expect(all.summary.escalatedCount).toBe(1);
      expect(all.currency).toBe('PKR');
      expect(all.asOf).toBe('2026-10-21');
      expect(all.byMonth).toHaveLength(12);
      expect(all.byMonth[0].month).toBe('2026-04');
      expect(all.byMonth.at(-1).month).toBe('2027-03');
      expect(all.byMonth.reduce((s, m) => s + m.dueAmount, 0)).toBeLessThanOrEqual(1_100_000);
      expect(all.ageing.map((x) => x.bucket)).toEqual(['1-30', '31-60', '61-90', '90+']);
      expect(all.ageing.reduce((s, x) => s + x.amount, 0)).toBe(all.summary.overdueAmount);
      expect(all.ageing.reduce((s, x) => s + x.count, 0)).toBe(all.summary.installmentsOverdue);
      expect(all.unitsByKind.map((k) => k.kind)).toEqual(['plot', 'flat', 'shop']);
      expect(all.unitsByKind.find((k) => k.kind === 'plot')).toMatchObject({
        total: 3,
        available: 1,
        blocked: 1,
        sold: 1,
      });
      expect(all.byProject.map((p) => p.projectName)).toEqual(['Alpha', 'Beta']);
      expect(all.byProject[0]).toMatchObject({ unitsTotal: 3, unitsSold: 1, saleValue: 700_000 });
      expect(all.byProject.reduce((s, p) => s + p.receivedAmount, 0)).toBe(
        all.summary.receivedAmount,
      );

      const onlyB = await stats(projectB.id);
      expect(onlyB.summary).toMatchObject({
        totalSaleValue: 400_000,
        bookingsCount: 1,
        receivedAmount: 0,
        unitsTotal: 2,
      });
      expect(onlyB.byProject).toHaveLength(1);
      expect(b.booking_id).toBeTruthy();
    });

    it('puts overdue invoices in the right ageing bucket at every boundary', async () => {
      const { tenantId, finance } = await tenant();
      const bookingId = newId();
      await run((r) =>
        r.bookingRefs.insert({
          bookingId,
          tenantId,
          customerId: newId(),
          customerName: 'x',
          customerPhone: null,
          customerEmail: null,
          unitId: newId(),
          unitNo: 'U',
          unitKind: 'plot',
          projectId: newId(),
          projectName: 'P',
          totalPrice: 1,
          currency: 'PKR',
          planName: 'p',
          status: 'active',
          bookedAt: '2026-01-01',
        }),
      );
      const lateDays = [1, 30, 31, 60, 61, 90, 91, 400];
      for (const [i, late] of lateDays.entries()) {
        await ds.query(
          `INSERT INTO billing.installment (id, tenant_id, booking_id, seq, kind, invoice_no, issued_on, due_date, amount, original_amount, status, project_id, customer_id, unit_id, unit_kind)
           VALUES ($1, $2, $3, $4, 'emi', $5, '2025-01-01', ('2026-10-21'::date - $6::int), 100, 100, 'overdue', $7, $8, $9, 'plot')`,
          [newId(), tenantId, bookingId, i, `INV-B-${newId()}`, late, newId(), newId(), newId()],
        );
      }
      const stats = await new GetCollectionStats({ uow, clock }).execute({ actor: finance });
      expect(stats.ageing).toEqual([
        { bucket: '1-30', count: 2, amount: 200 },
        { bucket: '31-60', count: 2, amount: 200 },
        { bucket: '61-90', count: 2, amount: 200 },
        { bucket: '90+', count: 2, amount: 200 },
      ]);
    });
  });

  describe('booking cancellation and ordering', () => {
    it('cancels unpaid invoices, keeps paid ones, and remembers a cancellation that arrives first', async () => {
      const { tenantId, finance } = await tenant();
      const d = await schedule(tenantId, { booked_at: '2026-05-01' });
      const [first] = await invoicesOf(d.booking_id);
      await new RecordPayment({ uow, clock }).execute({
        actor: finance,
        id: first.id,
        input: { method: 'cash' },
      });
      const { CancelBookingInvoices } =
        await import('../src/installments/application/CancelBookingInvoices.js');
      await new CancelBookingInvoices({ uow }).execute(
        buildEvent({
          type: EVENT.BOOKING_CANCELLED,
          tenantId,
          producer: 'sales',
          data: { booking_id: d.booking_id, unit_id: d.unit.id, customer_id: d.customer.id },
        }),
      );
      const list = await invoicesOf(d.booking_id);
      expect(list[0].status).toBe('paid');
      expect(list.slice(1).every((i) => i.status === 'cancelled')).toBe(true);

      const early = confirmEvent(tenantId);
      await new CancelBookingInvoices({ uow }).execute(
        buildEvent({
          type: EVENT.BOOKING_CANCELLED,
          tenantId,
          producer: 'sales',
          data: {
            booking_id: early.data.booking_id,
            unit_id: early.data.unit.id,
            customer_id: early.data.customer.id,
          },
        }),
      );
      await new CreateSchedule({ uow, clock }).execute(early);
      expect(await invoicesOf(early.data.booking_id)).toHaveLength(0);
    });
  });

  it('serves the whole service on the real stack: events in, payments through HTTP, summaries and audit out', async () => {
    const auth = await createTestAuth();
    const stripeMock = await sharedStripeMock();
    const gateway = createStripeGateway({
      secretKey: 'sk_test_mock',
      webhookSecret: 'whsec_mock',
      apiBase: stripeMock.url,
      maxNetworkRetries: 0,
    });
    const app = composeBilling({
      uow,
      clock,
      gateway,
      mailer: createMemoryMailer(),
      stripe: { publishableKey: 'pk_test', returnUrl: 'http://app.test/return?c={CHECKOUT_ID}' },
      verifier: auth.verifier,
      logger: silentLogger,
      internalToken: 'test-internal-token',
      idempotencyStore: createIdempotencyStore(ds, { schema: 'billing' }),
      readyCheck: () => ds.query('SELECT 1'),
    });
    const { tenantId } = await tenant('e2e');
    const owner = await auth.bearer({ role: 'owner', tenantId });
    const confirmed = confirmEvent(tenantId, {
      booked_at: '2026-05-01',
      plan: { name: 'p', down_pct: 50, installment_count: 1 },
    });
    expect((await deliverEvent(app, confirmed)).body).toEqual({ ok: true, duplicate: false });
    expect((await deliverEvent(app, confirmed)).body).toEqual({ ok: true, duplicate: true });
    const bookingId = confirmed.data.booking_id;

    const list = await request(app)
      .get(`/api/v1/admin/installments?booking_id=${bookingId}&sort=seq:asc`)
      .set(owner);
    expect(list.body.data).toHaveLength(2);
    const [down, emi] = list.body.data;
    const headers = { ...owner, 'Idempotency-Key': 'pay-1' };
    const paid = await request(app)
      .post(`/api/v1/admin/installments/${down.id}/pay`)
      .set(headers)
      .send({ method: 'bank_transfer' });
    expect(paid.body).toMatchObject({
      status: 'paid',
      receipt_no: expect.stringMatching(/^RCT-E2E-/),
    });
    const replay = await request(app)
      .post(`/api/v1/admin/installments/${down.id}/pay`)
      .set(headers)
      .send({ method: 'bank_transfer' });
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(
      (await ds.query('SELECT 1 FROM billing.payment WHERE installment_id = $1', [down.id])).length,
    ).toBe(1);

    await request(app)
      .post(`/api/v1/admin/installments/${emi.id}/pay`)
      .set(owner)
      .send({ method: 'cash' });
    const fully = await eventsOf(tenantId, 'booking.fully_paid');
    expect(fully.filter((e) => e.data.booking_id === bookingId)).toHaveLength(1);
    const summaries = (await eventsOf(tenantId, 'booking.summary_changed')).filter(
      (e) => e.data.booking_id === bookingId,
    );
    expect(summaries.map((e) => e.data.seq)).toEqual([1, 2, 3]);
    expect(summaries.at(-1).data).toMatchObject({
      installments_paid: 2,
      installments_total: 2,
      pending_amount: 0,
      received_amount: 120_000_000,
      escalated: false,
    });
    const audit = (
      await ds.query(
        'SELECT action FROM billing.audit_log WHERE tenant_id = $1 ORDER BY created_at, id',
        [tenantId],
      )
    ).map((r) => r.action);
    expect(audit).toEqual(
      [
        'tenant.create',
        'schedule.create',
        'installment.record_payment',
        'installment.record_payment',
      ].filter((a) => a !== 'tenant.create'),
    );
    expect((await request(app).get('/health/ready')).status).toBe(200);
    expect(
      (await request(app).get('/api/v1/admin/stats/collections').set(owner)).body.summary
        .received_amount,
    ).toBe(120_000_000);
  });
});
