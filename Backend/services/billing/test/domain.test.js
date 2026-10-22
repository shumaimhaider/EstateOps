import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, ForbiddenError, ValidationError } from '@estateops/kernel';
import {
  INACTIVE_STATUSES,
  balanceOf,
  daysLate,
  invoiceMachine,
  isPartPaid,
  outstanding,
  statusForDate,
} from '../src/installments/domain/invoice.js';
import { buildSchedule, toInvoices } from '../src/installments/domain/schedule.js';
import { applyPayment, MANUAL_METHODS, planPayment } from '../src/installments/domain/payment.js';
import { invoiceActions } from '../src/installments/domain/actions.js';
import { isSettled, summarizeInvoices } from '../src/installments/domain/summary.js';
import {
  createRule,
  fineFor,
  isRequiredDefault,
  resolveRule,
  sameLevel,
} from '../src/fines/domain/rule.js';
import { createSettings } from '../src/settings/domain/settings.js';
import { assertCanSendNotice, isEscalated } from '../src/escalations/domain/escalation.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fieldsOf = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};
const inv = (over = {}) => ({
  id: uuid(1),
  tenantId: uuid(9),
  bookingId: uuid(2),
  seq: 1,
  kind: 'emi',
  invoiceNo: 'INV-PK-000001',
  issuedOn: '2026-10-01',
  dueDate: '2026-11-01',
  amount: 1000,
  originalAmount: 1000,
  paidAmount: 0,
  fineAmount: 0,
  status: 'scheduled',
  paidAt: null,
  method: null,
  paymentSource: null,
  receivedOn: null,
  paymentReference: null,
  receiptNo: null,
  adjustmentReason: null,
  projectId: uuid(3),
  customerId: uuid(4),
  unitId: uuid(5),
  unitKind: 'plot',
  version: 1,
  ...over,
});

describe('invoice states', () => {
  it('moves along the machine and refuses everything else with 409', () => {
    expect(invoiceMachine.transition('scheduled', 'record_payment')).toBe('paid');
    expect(invoiceMachine.transition('overdue', 'waive')).toBe('waived');
    expect(invoiceMachine.transition('due', 'mark_overdue')).toBe('overdue');
    for (const status of ['paid', 'waived', 'cancelled'])
      expect(() => invoiceMachine.transition(status, 'record_payment')).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    expect(invoiceMachine.staffActions('overdue')).toEqual(['record_payment', 'waive', 'cancel']);
    expect(invoiceMachine.staffActions('paid')).toEqual([]);
  });
  it('is scheduled until the due date passes, due through the grace, then overdue', () => {
    expect(statusForDate('2026-10-21', '2026-10-21', 5)).toBe('scheduled');
    expect(statusForDate('2026-10-21', '2026-10-20', 5)).toBe('scheduled');
    expect(statusForDate('2026-10-21', '2026-10-22', 5)).toBe('due');
    expect(statusForDate('2026-10-21', '2026-10-26', 5)).toBe('due');
    expect(statusForDate('2026-10-21', '2026-10-27', 5)).toBe('overdue');
    expect(statusForDate('2026-10-21', '2026-10-22', 0)).toBe('overdue');
  });
  it('counts days late only for due and overdue invoices', () => {
    expect(daysLate(inv({ status: 'overdue', dueDate: '2026-10-01' }), '2026-10-21')).toBe(20);
    expect(daysLate(inv({ status: 'due', dueDate: '2026-10-20' }), '2026-10-21')).toBe(1);
    expect(daysLate(inv({ status: 'paid', dueDate: '2026-10-01' }), '2026-10-21')).toBe(0);
    expect(daysLate(inv({ status: 'scheduled', dueDate: '2026-12-01' }), '2026-10-21')).toBe(0);
  });
  it('owes nothing on inactive invoices, and spots part payments', () => {
    expect(INACTIVE_STATUSES).toEqual(['waived', 'rescheduled', 'cancelled']);
    expect(outstanding(inv({ paidAmount: 400 }))).toBe(600);
    expect(outstanding(inv({ status: 'waived' }))).toBe(0);
    expect(balanceOf(inv({ amount: 100, paidAmount: 150 }))).toBe(0);
    expect(isPartPaid(inv({ paidAmount: 1 }))).toBe(true);
    expect(isPartPaid(inv({ paidAmount: 1000, status: 'paid' }))).toBe(false);
  });
});

describe('payment schedule', () => {
  const build = (over = {}) =>
    buildSchedule({
      totalPrice: 1_000_000,
      downPct: 20,
      installmentCount: 12,
      bookedAt: '2026-01-31',
      today: '2026-10-21',
      graceDays: 5,
      ...over,
    });

  it('is a down payment plus equal installments that add up to the price', () => {
    const rows = build();
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({
      seq: 0,
      kind: 'down_payment',
      amount: 200_000,
      dueDate: '2026-01-31',
    });
    expect(rows[1]).toMatchObject({ seq: 1, kind: 'emi', amount: 66_666 });
    expect(rows.at(-1).amount).toBe(66_674);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(1_000_000);
  });
  it('lands installments on the same day each month, capped at the 28th', () => {
    const rows = build();
    expect(rows.slice(0, 4).map((r) => r.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
      '2026-04-28',
    ]);
    expect(rows.at(-1).dueDate).toBe('2027-01-28');
  });
  it('starts each invoice in the state the dates say, and issues it a week before it is due', () => {
    const rows = build({ bookedAt: '2026-05-10' });
    const byDue = (d) => rows.find((r) => r.dueDate === d);
    expect(byDue('2026-05-10')).toMatchObject({ status: 'overdue', issuedOn: '2026-05-10' }); // issued on the booking date, not before
    expect(byDue('2026-09-10')).toMatchObject({ status: 'overdue', issuedOn: '2026-09-03' });
    expect(byDue('2026-10-10')).toMatchObject({ status: 'overdue' });
    expect(byDue('2026-11-10')).toMatchObject({ status: 'scheduled', issuedOn: '2026-11-03' });
  });
  it('has no down payment at 0% and no installments at 100%', () => {
    const none = build({ downPct: 0 });
    expect(none[0].kind).toBe('emi');
    expect(none.reduce((a, r) => a + r.amount, 0)).toBe(1_000_000);
    const all = build({ downPct: 100 });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: 'down_payment', amount: 1_000_000 });
  });
  it('never makes an installment of zero, even for a tiny remainder', () => {
    const rows = build({ totalPrice: 10, downPct: 20, installmentCount: 12 });
    expect(rows.every((r) => r.amount >= 1)).toBe(true);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(10);
    expect(rows).toHaveLength(1 + 8);
  });
  it('rounds the down payment half up, with exact maths on very large prices', () => {
    expect(build({ totalPrice: 1005, downPct: 10, installmentCount: 1 })[0].amount).toBe(101);
    const big = build({ totalPrice: 9_000_000_000_000_000, downPct: 25, installmentCount: 2 });
    expect(big[0].amount).toBe(2_250_000_000_000_000);
    expect(big.reduce((a, r) => a + r.amount, 0)).toBe(9_000_000_000_000_000);
  });
  it('numbers invoices consecutively per tenant', () => {
    const booking = {
      tenantId: uuid(9),
      bookingId: uuid(2),
      projectId: uuid(3),
      customerId: uuid(4),
      unitId: uuid(5),
      unitKind: 'plot',
    };
    const out = toInvoices({ booking, rows: build().slice(0, 3), firstNumber: 41, slug: 'pk' });
    expect(out.map((i) => i.invoiceNo)).toEqual([
      'INV-PK-000041',
      'INV-PK-000042',
      'INV-PK-000043',
    ]);
    expect(out[0]).toMatchObject({
      originalAmount: 200_000,
      paidAmount: 0,
      fineAmount: 0,
      version: 1,
      unitKind: 'plot',
    });
    expect(new Set(out.map((i) => i.id)).size).toBe(3);
  });
});

describe('planning a payment', () => {
  const ctx = (over = {}) => ({
    today: '2026-10-21',
    canAdjust: true,
    referenceTaken: false,
    ...over,
  });
  const plan = (invoice, input, c = ctx(), methods = MANUAL_METHODS) =>
    planPayment(invoice, input, c, { methods });

  it('pays the whole balance by default, today, with no reference', () => {
    expect(plan(inv({ paidAmount: 250 }), { method: 'cash' })).toEqual({
      amount: 750,
      reference: null,
      receivedOn: '2026-10-21',
      note: null,
      adjustment: null,
    });
  });
  it('allows a part payment, an earlier received date, a trimmed reference and a note', () => {
    expect(
      plan(inv(), {
        method: 'cheque',
        amount: 300,
        receivedOn: '2026-10-01',
        reference: ' CHQ-9 ',
        note: ' dropped at office ',
      }),
    ).toMatchObject({
      amount: 300,
      receivedOn: '2026-10-01',
      reference: 'CHQ-9',
      note: 'dropped at office',
    });
  });
  it('refuses a bad method, amount, date, reference and note, all together', () => {
    expect(
      fieldsOf(() =>
        plan(
          inv(),
          {
            method: 'barter',
            amount: 5000,
            receivedOn: '2027-01-01',
            reference: 'X',
            note: 'n'.repeat(201),
          },
          ctx({ referenceTaken: true }),
        ),
      ),
    ).toEqual(['method', 'amount', 'received_on', 'reference', 'note']);
    expect(fieldsOf(() => plan(inv(), { method: 'cash', amount: 0 }))).toEqual(['amount']);
    expect(fieldsOf(() => plan(inv(), { method: 'cash', amount: 1.5 }))).toEqual(['amount']);
    expect(fieldsOf(() => plan(inv(), { method: 'cash', receivedOn: 'yesterday' }))).toEqual([
      'received_on',
    ]);
  });
  it('allows today as the received date but never tomorrow', () => {
    expect(plan(inv(), { method: 'cash', receivedOn: '2026-10-21' }).receivedOn).toBe('2026-10-21');
    expect(fieldsOf(() => plan(inv(), { method: 'cash', receivedOn: '2026-10-22' }))).toEqual([
      'received_on',
    ]);
  });
  it('has nothing to pay on a settled invoice', () => {
    expect(fieldsOf(() => plan(inv({ paidAmount: 1000 }), { method: 'cash' }))).toEqual(['amount']);
  });
  it('adjusts the invoice amount with a reason, above what is paid, and pays the new balance', () => {
    const p = plan(inv({ paidAmount: 100 }), {
      method: 'cash',
      adjustedAmount: 700,
      adjustmentReason: ' Early settlement ',
    });
    expect(p).toMatchObject({
      amount: 600,
      adjustment: { amount: 700, reason: 'Early settlement' },
    });
    const up = plan(inv(), {
      method: 'cash',
      amount: 1000,
      adjustedAmount: 1500,
      adjustmentReason: 'Documentation fee',
    });
    expect(up.adjustment.amount).toBe(1500);
  });
  it('refuses an adjustment without a reason, at or below what is paid, or a payment above the new balance', () => {
    expect(fieldsOf(() => plan(inv(), { method: 'cash', adjustedAmount: 900 }))).toEqual([
      'adjustment_reason',
    ]);
    expect(
      fieldsOf(() => plan(inv(), { method: 'cash', adjustedAmount: 900, adjustmentReason: 'x' })),
    ).toEqual(['adjustment_reason']);
    expect(
      fieldsOf(() =>
        plan(inv({ paidAmount: 400 }), {
          method: 'cash',
          adjustedAmount: 400,
          adjustmentReason: 'Too low',
        }),
      ),
    ).toEqual(['adjusted_amount']);
    expect(
      fieldsOf(() =>
        plan(inv(), {
          method: 'cash',
          amount: 950,
          adjustedAmount: 900,
          adjustmentReason: 'Discount',
        }),
      ),
    ).toEqual(['amount']);
  });
  it('ignores an adjustment to the same amount, and forbids adjusting without permission', () => {
    expect(plan(inv(), { method: 'cash', adjustedAmount: 1000 }).adjustment).toBeNull();
    expect(() =>
      plan(
        inv(),
        { method: 'cash', adjustedAmount: 900, adjustmentReason: 'Discount' },
        ctx({ canAdjust: false }),
      ),
    ).toThrow(ForbiddenError);
  });
  it('needs no method for a card payment', () => {
    expect(planPayment(inv(), { amount: 200 }, ctx(), { methods: null }).amount).toBe(200);
  });
});

describe('applying a payment', () => {
  const now = new Date('2026-10-21T09:00:00Z');
  const numbers = { reference: 'PAY-PK-000007', receipt: 'RCT-PK-000007' };
  const apply = (invoice, plan, over = {}) =>
    applyPayment(invoice, plan, {
      method: 'cash',
      source: 'manual',
      now,
      numbers,
      actor: { userId: uuid(8), name: 'Fiona' },
      ...over,
    });
  const plan = (over = {}) => ({
    amount: 1000,
    reference: null,
    receivedOn: '2026-10-21',
    note: null,
    adjustment: null,
    ...over,
  });

  it('settles a full payment: paid, receipt number, generated reference and a ledger row', () => {
    const { invoice, payment } = apply(inv(), plan());
    expect(invoice).toMatchObject({
      status: 'paid',
      paidAmount: 1000,
      paidAt: now,
      receiptNo: 'RCT-PK-000007',
      paymentReference: 'PAY-PK-000007',
      method: 'cash',
      paymentSource: 'manual',
      receivedOn: '2026-10-21',
    });
    expect(payment).toMatchObject({
      installmentId: uuid(1),
      bookingId: uuid(2),
      amount: 1000,
      source: 'manual',
      reference: 'PAY-PK-000007',
      recordedByName: 'Fiona',
      stripeIntentId: null,
    });
  });
  it('leaves a part payment open with no receipt', () => {
    const { invoice } = apply(inv({ status: 'overdue' }), plan({ amount: 400 }));
    expect(invoice).toMatchObject({
      status: 'overdue',
      paidAmount: 400,
      receiptNo: null,
      paidAt: null,
    });
  });
  it('keeps the given reference over the generated one', () => {
    expect(apply(inv(), plan({ reference: 'TT-55' })).payment.reference).toBe('TT-55');
  });
  it('records an adjustment: new amount and reason, the original kept, and settles the new balance', () => {
    const { invoice } = apply(
      inv({ paidAmount: 100 }),
      plan({ amount: 600, adjustment: { amount: 700, reason: 'Discount' } }),
    );
    expect(invoice).toMatchObject({
      amount: 700,
      originalAmount: 1000,
      adjustmentReason: 'Discount',
      paidAmount: 700,
      status: 'paid',
    });
  });
  it('records a card payment with its provider intent', () => {
    const { payment } = apply(inv(), plan({ reference: 'ch_123' }), {
      method: 'card',
      source: 'stripe',
      stripeIntentId: 'pi_9',
    });
    expect(payment).toMatchObject({
      method: 'card',
      source: 'stripe',
      stripeIntentId: 'pi_9',
      reference: 'ch_123',
    });
  });
  it('refuses to pay an invoice that cannot be paid', () => {
    expect(() => apply(inv({ status: 'paid', paidAmount: 1000 }), plan({ amount: 1 }))).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
});

describe('what staff may do to an invoice', () => {
  const as = (role, status = 'overdue') =>
    invoiceActions(inv({ status }), DEFAULT_ROLE_PERMISSIONS[role]);
  it('follows the state and the role', () => {
    expect(as('finance')).toEqual([
      'record_payment',
      'pay_by_card',
      'adjust_amount',
      'waive',
      'cancel',
    ]);
    expect(as('owner', 'scheduled')).toEqual([
      'record_payment',
      'pay_by_card',
      'adjust_amount',
      'waive',
      'cancel',
    ]);
    expect(as('sales_manager')).toEqual(['record_payment']);
    for (const role of ['sales_agent', 'support', 'auditor', 'marketing'])
      expect(as(role)).toEqual([]);
  });
  it('offers nothing on a settled, waived or cancelled invoice', () => {
    for (const status of ['paid', 'waived', 'cancelled']) expect(as('owner', status)).toEqual([]);
  });
});

describe('booking summary', () => {
  const rows = [
    inv({
      seq: 0,
      status: 'paid',
      amount: 200,
      paidAmount: 200,
      dueDate: '2026-01-01',
      fineAmount: 4,
    }),
    inv({
      seq: 1,
      status: 'overdue',
      amount: 100,
      paidAmount: 30,
      dueDate: '2026-09-01',
      fineAmount: 2,
    }),
    inv({ seq: 2, status: 'overdue', amount: 100, dueDate: '2026-09-15', fineAmount: 2 }),
    inv({ seq: 3, status: 'due', amount: 100, dueDate: '2026-10-20' }),
    inv({ seq: 4, status: 'scheduled', amount: 100, dueDate: '2026-11-20' }),
    inv({ seq: 5, status: 'waived', amount: 100, dueDate: '2026-12-20' }),
    inv({ seq: 6, status: 'cancelled', amount: 100, paidAmount: 0, dueDate: '2027-01-20' }),
  ];
  it('sums the invoices, ignoring inactive ones for what is owed', () => {
    expect(summarizeInvoices(rows, 3)).toEqual({
      installmentsTotal: 5,
      installmentsPaid: 1,
      installmentsDue: 1,
      installmentsOverdue: 2,
      installmentsUpcoming: 1,
      receivedAmount: 230,
      pendingAmount: 70 + 100 + 100 + 100,
      overdueAmount: 70 + 100,
      fineAmount: 8,
      nextDueDate: '2026-09-01',
      escalated: false,
    });
  });
  it('escalates at the threshold and not before', () => {
    expect(summarizeInvoices(rows, 2).escalated).toBe(true);
    expect(summarizeInvoices(rows, 3).escalated).toBe(false);
    expect(isEscalated(3, 3)).toBe(true);
    expect(isEscalated(2, 3)).toBe(false);
  });
  it('is empty and calm with no invoices, and spots a settled sale', () => {
    expect(summarizeInvoices([], 3)).toMatchObject({
      installmentsTotal: 0,
      pendingAmount: 0,
      nextDueDate: null,
      escalated: false,
    });
    expect(isSettled([])).toBe(false);
    expect(isSettled([inv({ status: 'paid' }), inv({ status: 'waived' })])).toBe(true);
    expect(isSettled([inv({ status: 'paid' }), inv({ status: 'due' })])).toBe(false);
  });
});

describe('fine rates', () => {
  const rule = (scope, scopeId, unitKind, kind, value) => ({
    id: `${scope}-${scopeId}-${unitKind}`,
    scope,
    scopeId,
    unitKind,
    kind,
    value,
  });
  const target = { customerId: 'c1', unitId: 'u1', projectId: 'p1', unitKind: 'shop' };

  it('validates a rule with every field named', () => {
    expect(
      fieldsOf(() => createRule({ tenantId: 't', scope: 'galaxy', kind: 'half', value: -1 })),
    ).toEqual(['scope', 'kind', 'value']);
    expect(
      fieldsOf(() =>
        createRule({ tenantId: 't', scope: 'project', scopeId: null, kind: 'percent', value: 1 }),
      ),
    ).toEqual(['scope_id']);
    expect(
      fieldsOf(() =>
        createRule({ tenantId: 't', scope: 'default', scopeId: 'x', kind: 'percent', value: 1 }),
      ),
    ).toEqual(['scope_id']);
    expect(
      fieldsOf(() =>
        createRule({
          tenantId: 't',
          scope: 'unit',
          scopeId: 'u',
          unitKind: 'shop',
          kind: 'percent',
          value: 1,
        }),
      ),
    ).toEqual(['unit_kind']);
    expect(
      fieldsOf(() =>
        createRule({
          tenantId: 't',
          scope: 'project',
          scopeId: 'p',
          unitKind: 'castle',
          kind: 'percent',
          value: 1,
        }),
      ),
    ).toEqual(['unit_kind']);
    expect(
      fieldsOf(() =>
        createRule({ tenantId: 't', scope: 'default', kind: 'percent', value: 10_001 }),
      ),
    ).toEqual(['value']);
    expect(
      fieldsOf(() => createRule({ tenantId: 't', scope: 'default', kind: 'fixed', value: 1.5 })),
    ).toEqual(['value']);
    expect(
      createRule({ tenantId: 't', scope: 'default', kind: 'fixed', value: 5_000_00 }),
    ).toMatchObject({ scopeId: null, unitKind: null, version: 1 });
  });
  it('prices a percentage (basis points, half up) or a fixed amount', () => {
    expect(fineFor(rule('default', null, null, 'percent', 200), 53_472_222)).toBe(1_069_444);
    expect(fineFor(rule('default', null, null, 'percent', 150), 1_001)).toBe(15);
    expect(fineFor(rule('default', null, null, 'fixed', 500_000), 123)).toBe(500_000);
    expect(fineFor(rule('default', null, null, 'percent', 0), 1000)).toBe(0);
    expect(fineFor(null, 1000)).toBe(0);
  });
  it('picks the most specific rate: customer+category, customer, property, project+category, project, default+category, default', () => {
    const all = [
      rule('default', null, null, 'percent', 700),
      rule('default', null, 'shop', 'percent', 600),
      rule('project', 'p1', null, 'percent', 500),
      rule('project', 'p1', 'shop', 'percent', 400),
      rule('unit', 'u1', null, 'percent', 300),
      rule('customer', 'c1', null, 'percent', 200),
      rule('customer', 'c1', 'shop', 'percent', 100),
    ];
    const winner = (list) => resolveRule(list, target)?.value;
    const without = (n) => all.slice(n);
    expect(winner(all)).toBe(100);
    expect(winner(all.filter((r) => r.value !== 100))).toBe(200);
    expect(winner(all.filter((r) => r.value > 200))).toBe(300);
    expect(winner(all.filter((r) => r.value > 300))).toBe(400);
    expect(winner(all.filter((r) => r.value > 400))).toBe(500);
    expect(winner(all.filter((r) => r.value > 500))).toBe(600);
    expect(winner(all.filter((r) => r.value > 600))).toBe(700);
    expect(without(7)).toEqual([]);
  });
  it('does not apply a rate of another category, project, customer or property', () => {
    const rules = [
      rule('default', null, null, 'percent', 700),
      rule('project', 'p9', null, 'percent', 500),
      rule('customer', 'c9', null, 'percent', 200),
      rule('unit', 'u9', null, 'percent', 300),
      rule('project', 'p1', 'plot', 'percent', 400),
    ];
    expect(resolveRule(rules, target).value).toBe(700);
    expect(resolveRule(rules, { ...target, unitKind: 'plot' }).value).toBe(400);
    expect(resolveRule([], target)).toBeNull();
    expect(
      resolveRule(rules, { customerId: null, unitId: null, projectId: null, unitKind: null }).value,
    ).toBe(700);
  });
  it('knows the required default and which rules share a level', () => {
    expect(isRequiredDefault(rule('default', null, null, 'percent', 1))).toBe(true);
    expect(isRequiredDefault(rule('default', null, 'shop', 'percent', 1))).toBe(false);
    expect(
      sameLevel(
        rule('project', 'p', 'shop', 'percent', 1),
        rule('project', 'p', 'shop', 'fixed', 9),
      ),
    ).toBe(true);
    expect(
      sameLevel(
        rule('project', 'p', 'shop', 'percent', 1),
        rule('project', 'p', null, 'percent', 1),
      ),
    ).toBe(false);
  });
});

describe('collection settings and escalation', () => {
  it('validates grace days and the escalation threshold', () => {
    expect(createSettings({ graceDays: 5, escalationMissed: 3 })).toEqual({
      graceDays: 5,
      escalationMissed: 3,
    });
    expect(createSettings({ graceDays: 0, escalationMissed: 1 })).toEqual({
      graceDays: 0,
      escalationMissed: 1,
    });
    expect(fieldsOf(() => createSettings({ graceDays: 61, escalationMissed: 0 }))).toEqual([
      'grace_days',
      'escalation_missed',
    ]);
    expect(fieldsOf(() => createSettings({ graceDays: 1.5, escalationMissed: 25 }))).toEqual([
      'grace_days',
      'escalation_missed',
    ]);
  });
  it('allows one notice to an escalated case only', () => {
    expect(() =>
      assertCanSendNotice({ overdueCount: 3, threshold: 3, noticeSent: false }),
    ).not.toThrow();
    expect(() => assertCanSendNotice({ overdueCount: 2, threshold: 3, noticeSent: false })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(() => assertCanSendNotice({ overdueCount: 3, threshold: 3, noticeSent: true })).toThrow(
      expect.objectContaining({ code: 'NOTICE_ALREADY_SENT' }),
    );
  });
});
