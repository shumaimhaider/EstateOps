import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B, eventsOfType } from '@estateops/platform/testing';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { CancelBookingInvoices } from '../src/installments/application/CancelBookingInvoices.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { ChangeInvoiceStatus } from '../src/installments/application/ChangeInvoiceStatus.js';
import { ListInstallments } from '../src/installments/application/ListInstallments.js';
import { GetInstallment } from '../src/installments/application/GetInstallment.js';
import { ListPayments } from '../src/installments/application/ListPayments.js';
import { SweepStatuses } from '../src/jobs/application/SweepStatuses.js';
import { SaveFineRule } from '../src/fines/application/SaveFineRule.js';
import { DeleteFineRule } from '../src/fines/application/DeleteFineRule.js';
import { ListFineRules } from '../src/fines/application/ListFineRules.js';
import { GetEffectiveFineRule } from '../src/fines/application/GetEffectiveFineRule.js';
import { ReapplyFineRate } from '../src/fines/application/ReapplyFineRate.js';
import { GetSettings } from '../src/settings/application/GetSettings.js';
import { UpdateSettings } from '../src/settings/application/UpdateSettings.js';
import { ListEscalations } from '../src/escalations/application/ListEscalations.js';
import { SendNotice } from '../src/escalations/application/SendNotice.js';
import { GetCollectionStats } from '../src/stats/application/GetCollectionStats.js';
import { ApplyTenant } from '../src/refs/application/ApplyTenant.js';
import { ApplyCustomer } from '../src/refs/application/ApplyCustomer.js';
import { CONFIRMED, actor, buildBillingTest, uuid } from './fakes.js';

describe('billing use cases', () => {
  let t;
  let finance;
  const ev = (type, data, tenantId = TEST_TENANT_A) =>
    buildEvent({ type, tenantId, producer: 'x', data, now: t.clock.now() });
  /** Schedules a booking made on `bookedAt`; with 2026-05-01 six invoices are overdue on 2026-10-21. */
  const schedule = (over = {}) =>
    new CreateSchedule(t.deps).execute(ev(EVENT.BOOKING_CONFIRMED, CONFIRMED(over)));
  const invoices = (bookingId = uuid(500)) =>
    [...t.stores.invoices.values()]
      .filter((i) => i.bookingId === bookingId)
      .sort((a, b) => a.seq - b.seq);
  const summaries = () => eventsOfType(t.events, 'booking.summary_changed');
  const pay = (id, input = { method: 'cash' }, a = finance) =>
    new RecordPayment(t.deps).execute({ actor: a, id, input });

  beforeEach(async () => {
    t = await buildBillingTest();
    finance = actor('finance');
  });

  describe('creating a schedule (booking.confirmed)', () => {
    it('builds the whole schedule with consecutive numbers, a booking snapshot and the first summary', async () => {
      await schedule();
      const list = invoices();
      expect(list).toHaveLength(13);
      expect(list.map((i) => i.invoiceNo).slice(0, 3)).toEqual([
        'INV-PK-000001',
        'INV-PK-000002',
        'INV-PK-000003',
      ]);
      expect(list[0]).toMatchObject({
        kind: 'down_payment',
        amount: 24_000_000,
        dueDate: '2026-10-21',
        status: 'scheduled',
        projectId: uuid(201),
        customerId: uuid(301),
        unitKind: 'plot',
      });
      expect(list.reduce((a, i) => a + i.amount, 0)).toBe(120_000_000);
      expect(t.stores.bookingRefs.get(uuid(500))).toMatchObject({
        status: 'active',
        customerName: 'Ali Raza',
        totalPrice: 120_000_000,
      });
      expect(eventsOfType(t.events, 'schedule.created')[0].data).toEqual({
        booking_id: uuid(500),
        invoices: 13,
      });
      expect(summaries()).toHaveLength(1);
      expect(summaries()[0].data).toMatchObject({
        seq: 1,
        installments_total: 13,
        installments_upcoming: 13,
        pending_amount: 120_000_000,
        received_amount: 0,
        escalated: false,
        next_due_date: '2026-10-21',
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'schedule.create',
        after: { invoices: 13 },
      });
    });
    it('keeps numbering across bookings of the same tenant without gaps', async () => {
      await schedule();
      await schedule({ booking_id: uuid(501) });
      expect(invoices(uuid(501))[0].invoiceNo).toBe('INV-PK-000014');
      expect(t.stores.counters.get(`${TEST_TENANT_A}|invoice`)).toBe(26);
    });
    it('starts a back-dated sale with overdue invoices already priced for fines, and flags it escalated', async () => {
      await schedule({ booked_at: '2026-05-01' });
      const list = invoices();
      expect(list.map((i) => i.status).slice(0, 8)).toEqual([
        'overdue',
        'overdue',
        'overdue',
        'overdue',
        'overdue',
        'overdue',
        'scheduled',
        'scheduled',
      ]);
      expect(list[0].fineAmount).toBe(480_000); // 2% of the down payment
      expect(list[1].fineAmount).toBe(160_000); // 2% of an installment
      expect(summaries()[0].data).toMatchObject({
        installments_overdue: 6,
        escalated: true,
        fine_amount: 480_000 + 5 * 160_000,
      });
    });
    it('tells sales to undo the booking when no schedule can be built, and creates nothing', async () => {
      await schedule({ total_price: 0 });
      expect(invoices()).toHaveLength(0);
      expect(t.stores.bookingRefs?.size ?? 0).toBe(0);
      expect(eventsOfType(t.events, 'schedule.created')).toHaveLength(0);
      expect(eventsOfType(t.events, 'schedule.failed')[0].data).toEqual({
        booking_id: uuid(500),
        reason: 'The plan produces no invoices',
      });
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'schedule.failed' });
    });
    it('does nothing for a repeat, an already scheduled booking, or one cancelled before it arrived', async () => {
      const e = ev(EVENT.BOOKING_CONFIRMED, CONFIRMED());
      await new CreateSchedule(t.deps).execute(e);
      expect((await new CreateSchedule(t.deps).execute(e)).duplicate).toBe(true);
      await schedule();
      expect(invoices()).toHaveLength(13);
      await new CancelBookingInvoices(t.deps).execute(
        ev(EVENT.BOOKING_CANCELLED, {
          booking_id: uuid(777),
          unit_id: uuid(101),
          customer_id: uuid(301),
        }),
      );
      await schedule({ booking_id: uuid(777) });
      expect(invoices(uuid(777))).toHaveLength(0);
    });
    it('asks for a retry when the tenant has not arrived yet', async () => {
      t.stores.tenantRefs.clear();
      await expect(schedule()).rejects.toThrow(/not known to billing yet/);
      expect(invoices()).toHaveLength(0);
    });
    it('handles a 0% down plan (no down payment) and a 100% plan (one invoice)', async () => {
      await schedule({ plan: { name: 'No down', down_pct: 0, installment_count: 6 } });
      expect(invoices().map((i) => i.kind)).toEqual(Array(6).fill('emi'));
      await schedule({
        booking_id: uuid(501),
        plan: { name: 'Cash', down_pct: 100, installment_count: 6 },
      });
      expect(invoices(uuid(501))).toHaveLength(1);
    });
  });

  describe('cancelling a booking (booking.cancelled)', () => {
    it('cancels every invoice nobody paid, keeps the ones with money, and marks the booking', async () => {
      await schedule();
      const [first, second] = invoices();
      await pay(first.id);
      await pay(second.id, { method: 'cash', amount: 100 });
      await new CancelBookingInvoices(t.deps).execute(
        ev(EVENT.BOOKING_CANCELLED, {
          booking_id: uuid(500),
          unit_id: uuid(101),
          customer_id: uuid(301),
        }),
      );
      const list = invoices();
      expect(list[0].status).toBe('paid');
      expect(list[1].status).toBe('scheduled'); // partially paid: stays for finance to settle
      expect(list.slice(2).every((i) => i.status === 'cancelled')).toBe(true);
      expect(t.stores.bookingRefs.get(uuid(500)).status).toBe('cancelled');
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'schedule.cancel',
        after: { invoicesCancelled: 11 },
      });
    });
    it('is harmless to repeat', async () => {
      await schedule();
      const e = ev(EVENT.BOOKING_CANCELLED, {
        booking_id: uuid(500),
        unit_id: uuid(101),
        customer_id: uuid(301),
      });
      await new CancelBookingInvoices(t.deps).execute(e);
      expect((await new CancelBookingInvoices(t.deps).execute(e)).duplicate).toBe(true);
    });
  });

  describe('marking a payment received', () => {
    beforeEach(() => schedule({ booked_at: '2026-05-01' }));

    it('settles an invoice: paid, receipt, generated reference, ledger row, audit, events', async () => {
      const [down] = invoices();
      const saved = await pay(down.id, {
        method: 'bank_transfer',
        receivedOn: '2026-10-01',
        note: 'TT from HBL',
      });
      expect(saved).toMatchObject({
        status: 'paid',
        paidAmount: 24_000_000,
        receiptNo: 'RCT-PK-000001',
        paymentReference: 'PAY-PK-000001',
        method: 'bank_transfer',
        paymentSource: 'manual',
        receivedOn: '2026-10-01',
      });
      expect(t.stores.payments[0]).toMatchObject({
        amount: 24_000_000,
        source: 'manual',
        note: 'TT from HBL',
        recordedByName: 'Fiona Finance',
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'installment.record_payment',
        before: { status: 'overdue', paidAmount: 0 },
        after: { status: 'paid' },
      });
      expect(eventsOfType(t.events, 'payment.recorded')[0].data).toMatchObject({
        installment_id: down.id,
        amount: 24_000_000,
        source: 'manual',
      });
    });
    it('tells the other services the new money position with a rising sequence number', async () => {
      const [a, b] = invoices();
      const before = summaries().length;
      await pay(a.id);
      await pay(b.id, { method: 'cash', amount: 50_000 });
      const [first, second] = summaries().slice(before);
      expect([first.data.seq, second.data.seq]).toEqual([2, 3]);
      expect(first.data).toMatchObject({
        installments_paid: 1,
        installments_overdue: 5,
        received_amount: 24_000_000,
      });
      expect(second.data).toMatchObject({ received_amount: 24_050_000, installments_overdue: 5 });
    });
    it('takes a part payment and then the rest', async () => {
      const [, emi] = invoices();
      const part = await pay(emi.id, { method: 'cash', amount: 3_000_000 });
      expect(part).toMatchObject({ status: 'overdue', paidAmount: 3_000_000, receiptNo: null });
      const rest = await pay(emi.id, { method: 'cheque' });
      expect(rest).toMatchObject({ status: 'paid', paidAmount: 8_000_000 });
      expect(t.stores.payments.map((p) => p.amount)).toEqual([3_000_000, 5_000_000]);
      expect(new Set(t.stores.payments.map((p) => p.reference)).size).toBe(2);
    });
    it('adjusts the invoice amount, keeping the original and the reason, and audits it', async () => {
      const [, emi] = invoices();
      const saved = await pay(emi.id, {
        method: 'cash',
        adjustedAmount: 7_000_000,
        adjustmentReason: 'Early settlement discount',
      });
      expect(saved).toMatchObject({
        amount: 7_000_000,
        originalAmount: 8_000_000,
        adjustmentReason: 'Early settlement discount',
        status: 'paid',
        paidAmount: 7_000_000,
      });
      expect(t.auditEntries.filter((a) => a.action === 'installment.adjust_amount')).toEqual([
        expect.objectContaining({
          before: { amount: 8_000_000 },
          after: { amount: 7_000_000, reason: 'Early settlement discount' },
        }),
      ]);
    });
    it('refuses what the rules refuse: dates, references, amounts, adjustments, states', async () => {
      const [a, b] = invoices();
      await expect(pay(a.id, { method: 'cash', receivedOn: '2026-10-22' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'received_on', message: expect.any(String) }],
      });
      await expect(pay(a.id, { method: 'cash', amount: 999_999_999 })).rejects.toMatchObject({
        details: [{ field: 'amount', message: expect.any(String) }],
      });
      await expect(pay(a.id, { method: 'cash', adjustedAmount: 1 })).rejects.toMatchObject({
        details: [{ field: 'adjustment_reason', message: expect.any(String) }],
      });
      await pay(a.id, { method: 'cash', reference: 'TT-1' });
      await expect(pay(b.id, { method: 'cash', reference: 'TT-1' })).rejects.toMatchObject({
        details: [{ field: 'reference', message: expect.any(String) }],
      });
      await expect(pay(a.id, { method: 'cash' })).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
      await expect(pay(uuid(404), { method: 'cash' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('needs payments.record, and invoices.adjust to change the amount', async () => {
      const [a, b] = invoices();
      await expect(pay(a.id, { method: 'cash' }, actor('sales_agent'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(pay(a.id, { method: 'cash' }, actor('support'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      const manager = actor('sales_manager');
      await expect(
        pay(a.id, { method: 'cash', adjustedAmount: 100, adjustmentReason: 'Discount' }, manager),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(pay(b.id, { method: 'cash' }, manager)).resolves.toMatchObject({
        status: 'paid',
      });
    });
    it('hides another tenant’s invoice', async () => {
      const [a] = invoices();
      await expect(
        pay(a.id, { method: 'cash' }, actor('finance', { tenantId: TEST_TENANT_B })),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('announces booking.fully_paid once, when the last active invoice is paid', async () => {
      const list = invoices();
      for (const invoice of list.slice(0, -1)) await pay(invoice.id);
      expect(eventsOfType(t.events, 'booking.fully_paid')).toHaveLength(0);
      await new ChangeInvoiceStatus(t.deps).execute({
        actor: finance,
        id: list.at(-1).id,
        action: 'waive',
      });
      expect(eventsOfType(t.events, 'booking.fully_paid')).toHaveLength(1);
      expect(eventsOfType(t.events, 'booking.fully_paid')[0].data).toEqual({
        booking_id: uuid(500),
      });
      expect(t.stores.bookingRefs.get(uuid(500)).status).toBe('completed');
    });
  });

  describe('waiving and cancelling an invoice', () => {
    beforeEach(() => schedule({ booked_at: '2026-05-01' }));
    it('waives an invoice: it stops being owed, and the summary says so', async () => {
      const [, emi] = invoices();
      const before = (await t.repos.summaries.compute(TEST_TENANT_A, uuid(500), 3)).pendingAmount;
      const saved = await new ChangeInvoiceStatus(t.deps).execute({
        actor: finance,
        id: emi.id,
        action: 'waive',
      });
      expect(saved.status).toBe('waived');
      expect(summaries().at(-1).data.pending_amount).toBe(before - 8_000_000);
      expect(summaries().at(-1).data.installments_total).toBe(12);
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'installment.waive' });
    });
    it('cancels an invoice, but not a settled one, and needs invoices.adjust', async () => {
      const [a, b] = invoices();
      await new ChangeInvoiceStatus(t.deps).execute({ actor: finance, id: a.id, action: 'cancel' });
      await pay(b.id);
      await expect(
        new ChangeInvoiceStatus(t.deps).execute({ actor: finance, id: b.id, action: 'waive' }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        new ChangeInvoiceStatus(t.deps).execute({
          actor: actor('sales_manager'),
          id: b.id,
          action: 'cancel',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('reading the register', () => {
    beforeEach(() => schedule({ booked_at: '2026-05-01' }));
    const list = (f = {}, a = finance) => new ListInstallments(t.deps).execute({ actor: a, ...f });

    it('shows balance, days late and the actions this role may take', async () => {
      const rows = (await list({ sort: 'seq:asc', limit: 3 })).items;
      expect(rows[0]).toMatchObject({
        balance: 24_000_000,
        daysLate: 173,
        unitNo: 'A-01',
        buyerName: 'Ali Raza',
        currency: 'PKR',
      });
      expect(rows[0].allowedActions).toEqual([
        'record_payment',
        'pay_by_card',
        'adjust_amount',
        'waive',
        'cancel',
      ]);
      const agent = (await list({ limit: 1 }, actor('sales_agent'))).items[0];
      expect(agent.allowedActions).toEqual([]);
    });
    it('filters, sorts and pages', async () => {
      expect((await list({ status: 'overdue' })).items).toHaveLength(6);
      expect((await list({ bookingId: uuid(500), sort: 'seq:desc' })).items[0].invoice.seq).toBe(
        12,
      );
      expect((await list({ q: 'inv-pk-000003' })).items).toHaveLength(1);
      expect((await list({ dueFrom: '2026-10-01', dueTo: '2026-10-31' })).items).toHaveLength(1);
      expect((await list({ unitKind: 'shop' })).items).toHaveLength(0);
      const first = await list({ limit: 5 });
      expect(first.nextCursor).toEqual(expect.any(String));
      expect((await list({ limit: 5, cursor: first.nextCursor })).items).toHaveLength(5);
      await expect(list({ sort: 'fine:desc' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
    it('reads one invoice and its payments, and is closed to roles without sales.view', async () => {
      const [a] = invoices();
      await pay(a.id, { method: 'cash', amount: 100 });
      expect(
        (await new GetInstallment(t.deps).execute({ actor: finance, id: a.id })).invoice.id,
      ).toBe(a.id);
      expect(await new ListPayments(t.deps).execute({ actor: finance, id: a.id })).toHaveLength(1);
      await expect(
        new GetInstallment(t.deps).execute({ actor: finance, id: uuid(404) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new ListPayments(t.deps).execute({ actor: finance, id: uuid(404) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(list({}, actor('marketing'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await list({}, actor('owner', { tenantId: TEST_TENANT_B }))).items).toHaveLength(0);
    });
  });

  describe('the daily sweep', () => {
    it('moves scheduled to due to overdue as days pass, prices fines, announces summaries, and can run twice', async () => {
      await schedule(); // booked today: nothing late yet
      expect(await new SweepStatuses(t.deps).execute()).toEqual({
        tenants: 0,
        movedToDue: 0,
        movedToOverdue: 0,
      });
      t.clock.advanceDays(3);
      const sweep = new SweepStatuses(t.deps);
      expect(await sweep.execute()).toEqual({ tenants: 1, movedToDue: 1, movedToOverdue: 0 });
      expect(invoices()[0].status).toBe('due');
      const before = summaries().length;
      t.clock.advanceDays(10);
      expect(await sweep.execute()).toEqual({ tenants: 1, movedToDue: 0, movedToOverdue: 1 });
      expect(invoices()[0]).toMatchObject({ status: 'overdue', fineAmount: 480_000 });
      expect(summaries().length).toBe(before + 1);
      expect(summaries().at(-1).data).toMatchObject({
        installments_overdue: 1,
        fine_amount: 480_000,
      });
      expect(await sweep.execute()).toEqual({ tenants: 0, movedToDue: 0, movedToOverdue: 0 });
    });
    it('goes through a large backlog in batches', async () => {
      await schedule({ booked_at: '2026-01-05' });
      invoices().forEach((i) => (i.status = 'scheduled'));
      expect(
        (await new SweepStatuses(t.deps).execute({ batchSize: 2 })).movedToOverdue,
      ).toBeGreaterThanOrEqual(6);
      expect(invoices().filter((i) => i.status === 'overdue').length).toBeGreaterThanOrEqual(6);
    });
    it('uses the tenant’s grace days', async () => {
      await schedule();
      await new UpdateSettings(t.deps).execute({
        actor: finance,
        input: { graceDays: 0, escalationMissed: 3 },
      });
      t.clock.advanceDays(1);
      expect((await new SweepStatuses(t.deps).execute()).movedToOverdue).toBe(1);
    });
    it('leaves paid, waived and cancelled invoices alone', async () => {
      await schedule();
      const [a, b] = invoices();
      await pay(a.id);
      await new ChangeInvoiceStatus(t.deps).execute({ actor: finance, id: b.id, action: 'cancel' });
      t.clock.advanceDays(400);
      await new SweepStatuses(t.deps).execute();
      expect(
        invoices()
          .slice(0, 2)
          .map((i) => i.status),
      ).toEqual(['paid', 'cancelled']);
    });
  });

  describe('fine rates', () => {
    beforeEach(async () => {
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
      await schedule({ booked_at: '2026-05-01' });
    });
    const save = (input, a = finance) =>
      new SaveFineRule(t.deps).execute({ actor: a, unitKind: null, scopeId: null, ...input });
    const fineOf = (n) => invoices()[n].fineAmount;

    it('a project rate re-prices that project’s overdue invoices straight away, then a customer rate beats it', async () => {
      expect(fineOf(1)).toBe(160_000);
      await save({ scope: 'project', scopeId: uuid(201), kind: 'fixed', value: 500_000 });
      expect(fineOf(1)).toBe(500_000);
      await save({ scope: 'customer', scopeId: uuid(301), kind: 'percent', value: 1000 });
      expect(fineOf(1)).toBe(800_000);
      const rules = await new ListFineRules(t.deps).execute({ actor: finance });
      expect(rules.items.map((i) => i.rule.scope)).toEqual(['default', 'project', 'customer']);
      expect(summaries().at(-1).data.fine_amount).toBe(2_400_000 + 5 * 800_000);
    });
    it('a category rate prices only that category, and a property rate beats project+category', async () => {
      await save({
        scope: 'project',
        scopeId: uuid(201),
        unitKind: 'shop',
        kind: 'fixed',
        value: 999,
      });
      expect(fineOf(1)).toBe(160_000); // our unit is a plot
      await save({
        scope: 'project',
        scopeId: uuid(201),
        unitKind: 'plot',
        kind: 'fixed',
        value: 700_000,
      });
      expect(fineOf(1)).toBe(700_000);
      await save({ scope: 'unit', scopeId: uuid(101), kind: 'fixed', value: 300_000 });
      expect(fineOf(1)).toBe(300_000); // the single property is more specific than project+category
      const property = (await new ListFineRules(t.deps).execute({ actor: finance })).items.find(
        (i) => i.rule.scope === 'unit',
      );
      await new DeleteFineRule(t.deps).execute({ actor: finance, id: property.rule.id });
      expect(fineOf(1)).toBe(700_000);
    });
    it('a default rate is re-priced by the fine_rate.changed event, not inline', async () => {
      const before = eventsOfType(t.events, 'fine_rate.changed').length;
      await save({ scope: 'default', kind: 'percent', value: 300 });
      expect(fineOf(1)).toBe(160_000);
      const [event] = eventsOfType(t.events, 'fine_rate.changed').slice(before);
      expect(event.data).toEqual({ scope: 'default', scope_id: null, unit_kind: null });
      await new ReapplyFineRate(t.deps).execute(event);
      expect(fineOf(1)).toBe(240_000);
      expect((await new ReapplyFineRate(t.deps).execute(event)).duplicate).toBe(true);
    });
    it('re-prices in batches and leaves paid invoices with the fine they were charged', async () => {
      const [down] = invoices();
      await new RecordPayment(t.deps).execute({
        actor: finance,
        id: down.id,
        input: { method: 'cash' },
      });
      await save({ scope: 'default', kind: 'percent', value: 500 });
      const event = eventsOfType(t.events, 'fine_rate.changed').at(-1);
      await new ReapplyFineRate({ ...t.deps, batchSize: 2 }).execute(event);
      expect(fineOf(0)).toBe(480_000); // paid: unchanged
      expect(fineOf(1)).toBe(400_000);
      expect(fineOf(5)).toBe(400_000);
    });
    it('replaces the rate at a level instead of adding a second, and removing it falls back', async () => {
      await save({ scope: 'project', scopeId: uuid(201), kind: 'fixed', value: 1 });
      await save({ scope: 'project', scopeId: uuid(201), kind: 'fixed', value: 2 });
      const rules = (await new ListFineRules(t.deps).execute({ actor: finance })).items.filter(
        (i) => i.rule.scope === 'project',
      );
      expect(rules).toHaveLength(1);
      expect(rules[0].rule.value).toBe(2);
      await new DeleteFineRule(t.deps).execute({ actor: finance, id: rules[0].rule.id });
      expect(fineOf(1)).toBe(160_000);
    });
    it('checks the target exists, and refuses bad values', async () => {
      await expect(
        save({ scope: 'project', scopeId: uuid(999), kind: 'percent', value: 1 }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'scope_id', message: expect.any(String) }],
      });
      await expect(
        save({ scope: 'default', kind: 'percent', value: 10_001 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        save({ scope: 'unit', scopeId: uuid(101), unitKind: 'plot', kind: 'percent', value: 1 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
    it('never removes the default, and 404s for an unknown rule', async () => {
      await expect(
        new DeleteFineRule(t.deps).execute({ actor: finance, id: uuid(900) }),
      ).rejects.toMatchObject({ code: 'DEFAULT_RULE_REQUIRED' });
      await expect(
        new DeleteFineRule(t.deps).execute({ actor: finance, id: uuid(404) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('shows where an effective rate comes from, and what the role may do', async () => {
      const effective = (input, a = finance) =>
        new GetEffectiveFineRule(t.deps).execute({ actor: a, ...input });
      expect(await effective({ scope: 'unit', scopeId: uuid(101) })).toMatchObject({
        inherited: true,
        rule: { scope: 'default' },
        effectiveActions: ['set'],
        currency: 'PKR',
      });
      await save({
        scope: 'customer',
        scopeId: uuid(301),
        unitKind: 'plot',
        kind: 'percent',
        value: 50,
      });
      expect(await effective({ scope: 'unit', scopeId: uuid(101) })).toMatchObject({
        inherited: true,
        rule: { scope: 'customer', unitKind: 'plot' },
      });
      expect(
        await effective({ scope: 'customer', scopeId: uuid(301), unitKind: 'plot' }),
      ).toMatchObject({ inherited: false, effectiveActions: ['set', 'clear'] });
      expect(await effective({ scope: 'default' })).toMatchObject({
        inherited: false,
        effectiveActions: ['set'],
      });
      expect((await effective({ scope: 'default' }, actor('auditor'))).effectiveActions).toEqual(
        [],
      );
      await expect(effective({ scope: 'project', scopeId: uuid(999) })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        effective({ scope: 'unit', scopeId: uuid(101), unitKind: 'shop' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(effective({ scope: 'galaxy' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('needs fines.view to look and fines.manage to change', async () => {
      await expect(
        new ListFineRules(t.deps).execute({ actor: actor('sales_agent') }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        save({ scope: 'default', kind: 'percent', value: 1 }, actor('auditor')),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new DeleteFineRule(t.deps).execute({ actor: actor('auditor'), id: uuid(900) }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (await new ListFineRules(t.deps).execute({ actor: actor('auditor') })).items[0]
          .allowedActions,
      ).toEqual([]);
    });
  });

  describe('collection settings', () => {
    it('reads defaults, updates, and re-announces escalation when the threshold moves', async () => {
      await schedule({ booked_at: '2026-05-01' });
      expect(await new GetSettings(t.deps).execute({ actor: finance })).toEqual({
        graceDays: 5,
        escalationMissed: 3,
      });
      const before = summaries().length;
      const saved = await new UpdateSettings(t.deps).execute({
        actor: finance,
        input: { graceDays: 5, escalationMissed: 7 },
      });
      expect(saved.escalationMissed).toBe(7);
      expect(summaries().length).toBe(before + 1);
      expect(summaries().at(-1).data.escalated).toBe(false);
      await new UpdateSettings(t.deps).execute({
        actor: finance,
        input: { graceDays: 9, escalationMissed: 7 },
      });
      expect(summaries().length).toBe(before + 1);
    });
    it('validates and needs fines.manage', async () => {
      await expect(
        new UpdateSettings(t.deps).execute({
          actor: finance,
          input: { graceDays: 99, escalationMissed: 0 },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        new UpdateSettings(t.deps).execute({
          actor: actor('auditor'),
          input: { graceDays: 5, escalationMissed: 3 },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new GetSettings(t.deps).execute({ actor: actor('marketing') }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('escalated cases', () => {
    beforeEach(() => schedule({ booked_at: '2026-05-01' }));
    const list = (a = finance) => new ListEscalations(t.deps).execute({ actor: a });

    it('lists bookings at the threshold with what is owed, the oldest due date and days late', async () => {
      const { items } = await list();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        bookingId: uuid(500),
        missedInstallments: 6,
        oldestDueDate: '2026-05-01',
        daysLate: 173,
        status: 'open',
        allowedActions: ['send_notice'],
        buyerName: 'Ali Raza',
      });
      expect(items[0].overdueAmount).toBe(24_000_000 + 5 * 8_000_000);
    });
    it('drops the case when payments bring the overdue count below the threshold', async () => {
      for (const i of invoices().slice(0, 4)) await pay(i.id);
      expect((await list()).items).toHaveLength(0);
    });
    it('sends one notice, then shows it sent and refuses a second', async () => {
      const sent = await new SendNotice(t.deps).execute({ actor: finance, bookingId: uuid(500) });
      expect(sent).toMatchObject({ status: 'notice_sent', allowedActions: [] });
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'escalation.send_notice' });
      expect((await list()).items[0]).toMatchObject({ status: 'notice_sent', allowedActions: [] });
      await expect(
        new SendNotice(t.deps).execute({ actor: finance, bookingId: uuid(500) }),
      ).rejects.toMatchObject({ code: 'NOTICE_ALREADY_SENT' });
    });
    it('refuses a notice when the booking is not escalated or unknown, and needs permission', async () => {
      for (const i of invoices().slice(0, 4)) await pay(i.id);
      await expect(
        new SendNotice(t.deps).execute({ actor: finance, bookingId: uuid(500) }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        new SendNotice(t.deps).execute({ actor: finance, bookingId: uuid(404) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        new SendNotice(t.deps).execute({ actor: actor('auditor'), bookingId: uuid(500) }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(list(actor('marketing'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('shows no send action to someone who can look but not act', async () => {
      expect((await list(actor('auditor'))).items[0].allowedActions).toEqual([]);
    });
  });

  describe('collection stats', () => {
    it('passes the figures through with the tenant currency and today’s date, behind stats.view', async () => {
      const stats = await new GetCollectionStats(t.deps).execute({ actor: finance });
      expect(stats).toMatchObject({ currency: 'PKR', asOf: '2026-10-21' });
      await expect(
        new GetCollectionStats(t.deps).execute({ actor: actor('sales_agent') }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('snapshots from other services', () => {
    const tenantEvent = (currency, at) => ({
      ...ev(
        EVENT.TENANT_UPSERTED,
        {
          slug: 'ae',
          name: 'Desert Rose',
          currency,
          locale: 'en-AE',
          time_zone: 'Asia/Dubai',
          area_unit: 'sq_ft',
        },
        TEST_TENANT_B,
      ),
      occurred_at: at,
    });
    it('gives a new tenant the default settings and a 2% default fine rate, once', async () => {
      await new ApplyTenant(t.deps).execute(tenantEvent('AED', '2026-10-21T10:00:00.000Z'));
      await new ApplyTenant(t.deps).execute(tenantEvent('AED', '2026-10-21T11:00:00.000Z'));
      expect(t.stores.settings.get(TEST_TENANT_B)).toEqual({ graceDays: 5, escalationMissed: 3 });
      const rules = t.stores.rules.filter((r) => r.tenantId === TEST_TENANT_B);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        scope: 'default',
        unitKind: null,
        kind: 'percent',
        value: 200,
      });
    });
    it('keeps the newest tenant snapshot when events arrive out of order', async () => {
      await new ApplyTenant(t.deps).execute(tenantEvent('AED', '2026-10-21T10:00:00.000Z'));
      await new ApplyTenant(t.deps).execute(tenantEvent('USD', '2026-10-21T08:00:00.000Z'));
      expect(t.stores.tenantRefs.get(TEST_TENANT_B).currency).toBe('AED');
    });
    it('renames the customer on their bookings', async () => {
      await schedule();
      await new ApplyCustomer(t.deps).execute(
        ev(EVENT.CUSTOMER_UPSERTED, {
          customer_id: uuid(301),
          full_name: 'Ali R. Khan',
          phone: null,
          email: null,
        }),
      );
      expect(t.stores.bookingRefs.get(uuid(500)).customerName).toBe('Ali R. Khan');
    });
  });
});
