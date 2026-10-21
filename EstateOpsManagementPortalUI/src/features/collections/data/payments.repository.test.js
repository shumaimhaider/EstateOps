import { describe, expect, it } from 'vitest';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { createInstallmentsRepository } from './installments.repository.js';

const repo = createInstallmentsRepository();
const GOOD_CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };
const card = (number) => ({ ...GOOD_CARD, number });

/** An unpaid overdue PK invoice. */
function unpaidInvoice() {
  const db = getDb();
  return db.installments.find(
    (i) => i.tenant_id === db.tenants[0].id && i.status === 'overdue' && i.paid_amount === 0,
  );
}
const asRole = (role) => tokenStore.set(mockToken('pk', role));

describe('marking a payment received by hand', () => {
  it('records the date it was received and that it was recorded manually', async () => {
    const row = unpaidInvoice();
    const paid = await repo.recordPayment(row.id, {
      method: 'bank_transfer',
      reference: 'TT-1001',
      receivedOn: '2026-10-01',
    });
    expect(paid).toMatchObject({
      status: 'paid',
      paymentSource: 'manual',
      receivedOn: '2026-10-01',
      paymentReference: 'TT-1001',
    });
    expect(getDb().payments.at(-1)).toMatchObject({ source: 'manual', received_on: '2026-10-01' });
  });

  it('rejects a received date in the future and a reference that is already used', async () => {
    const row = unpaidInvoice();
    await expect(
      repo.recordPayment(row.id, { method: 'cash', receivedOn: '2999-01-01' }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { receivedOn: expect.any(String) } });

    const other = getDb().installments.find((i) => i.payment_reference && i.id !== row.id);
    await expect(
      repo.recordPayment(row.id, { method: 'cash', reference: other.payment_reference }),
    ).rejects.toMatchObject({ fieldErrors: { reference: expect.any(String) } });
  });

  it('takes a part payment and leaves the rest open, then settles it', async () => {
    const row = unpaidInvoice();
    const half = Math.floor(row.amount / 2);
    const part = await repo.recordPayment(row.id, { method: 'cash', amountMinor: half });
    expect(part.status).toBe('overdue');
    expect(part.balance.minor).toBe(row.amount - half);
    const rest = await repo.recordPayment(row.id, { method: 'cheque' });
    expect(rest.status).toBe('paid');
    expect(rest.paid.minor).toBe(row.amount);
  });

  it('refuses more than the balance, and a payment on a paid invoice', async () => {
    const row = unpaidInvoice();
    await expect(
      repo.recordPayment(row.id, { method: 'cash', amountMinor: row.amount + 1 }),
    ).rejects.toMatchObject({ fieldErrors: { amount: expect.any(String) } });
    await repo.recordPayment(row.id, { method: 'cash' });
    await expect(repo.recordPayment(row.id, { method: 'cash' })).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    });
  });
});

describe('adjusting the invoice amount while taking payment', () => {
  it('changes the invoice amount, keeps the original and the reason, and settles the new balance', async () => {
    const row = unpaidInvoice();
    const original = row.amount;
    const paid = await repo.recordPayment(row.id, {
      method: 'cash',
      adjustedAmountMinor: original - 100_000,
      adjustmentReason: 'Early settlement discount',
    });
    expect(paid.amount.minor).toBe(original - 100_000);
    expect(paid.originalAmount.minor).toBe(original);
    expect(paid.adjustmentReason).toBe('Early settlement discount');
    expect(paid.status).toBe('paid');
    expect(paid.paid.minor).toBe(original - 100_000);
    expect(getDb().audit.some((a) => a.action === 'installment.adjust_amount')).toBe(true);
  });

  it('can raise the amount, for example to add a charge', async () => {
    const row = unpaidInvoice();
    const paid = await repo.recordPayment(row.id, {
      method: 'cash',
      amountMinor: row.amount,
      adjustedAmountMinor: row.amount + 50_000,
      adjustmentReason: 'Documentation charge',
    });
    expect(paid.status).toBe('overdue');
    expect(paid.balance.minor).toBe(50_000);
  });

  it('needs a reason, and an amount above what is already paid', async () => {
    const row = unpaidInvoice();
    await expect(
      repo.recordPayment(row.id, { method: 'cash', adjustedAmountMinor: row.amount - 1 }),
    ).rejects.toMatchObject({ fieldErrors: { adjustmentReason: expect.any(String) } });

    const half = Math.floor(row.amount / 2);
    await repo.recordPayment(row.id, { method: 'cash', amountMinor: half });
    await expect(
      repo.recordPayment(row.id, {
        method: 'cash',
        adjustedAmountMinor: half,
        adjustmentReason: 'Too low',
      }),
    ).rejects.toMatchObject({ fieldErrors: { adjustedAmount: expect.any(String) } });
  });

  it('is offered only to roles that may adjust', async () => {
    const row = unpaidInvoice();
    asRole('sales_manager');
    const list = await repo.list({ bookingId: row.booking_id });
    const invoice = list.items.find((i) => i.id === row.id);
    expect(invoice.allowedActions).toContain('record_payment');
    expect(invoice.allowedActions).not.toContain('adjust_amount');
    await expect(
      repo.recordPayment(row.id, {
        method: 'cash',
        adjustedAmountMinor: row.amount - 1,
        adjustmentReason: 'Nope',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(row.amount).toBe(invoice.amount.minor);
  });
});

describe('paying by card (Stripe)', () => {
  it('charges the card, then records the payment with the Stripe charge as its reference', async () => {
    const row = unpaidInvoice();
    const half = Math.floor(row.amount / 2);
    const paid = await repo.payByCard(row.id, { method: 'card', amountMinor: half }, GOOD_CARD, {
      idempotencyKey: 'card-1',
    });
    expect(paid).toMatchObject({ paymentSource: 'stripe', status: 'overdue' });
    expect(paid.paid.minor).toBe(half);
    expect(paid.paymentReference).toMatch(/^ch_mock_/);
    expect(getDb().payments.at(-1)).toMatchObject({ source: 'stripe', method: 'card' });
  });

  it('does not charge twice when the same payment is replayed', async () => {
    const row = unpaidInvoice();
    const attempt = () =>
      repo.payByCard(row.id, { method: 'card' }, GOOD_CARD, { idempotencyKey: 'card-replay' });
    const first = await attempt();
    const again = await attempt();
    expect(again.paid.minor).toBe(first.paid.minor);
    expect(getDb().payments.filter((p) => p.installment_id === row.id)).toHaveLength(1);
  });

  it('leaves the invoice untouched when the card is declined, then succeeds with a good card', async () => {
    const row = unpaidInvoice();
    const key = { idempotencyKey: 'card-retry' };
    await expect(
      repo.payByCard(row.id, { method: 'card' }, card('4000000000000002'), key),
    ).rejects.toMatchObject({ message: 'Your card was declined.' });
    await expect(
      repo.payByCard(row.id, { method: 'card' }, card('4000000000009995'), key),
    ).rejects.toMatchObject({ message: 'Your card has insufficient funds.' });
    expect(row.paid_amount).toBe(0);
    expect(getDb().payments).toHaveLength(0);

    const paid = await repo.payByCard(row.id, { method: 'card' }, GOOD_CARD, key);
    expect(paid.status).toBe('paid');
  });

  it('points card errors at the right field', async () => {
    const row = unpaidInvoice();
    await expect(
      repo.payByCard(row.id, { method: 'card' }, card('1234 5678 9012 3456'), {}),
    ).rejects.toMatchObject({ fieldErrors: { cardNumber: expect.any(String) } });
    await expect(
      repo.payByCard(row.id, { method: 'card' }, { ...GOOD_CARD, expiry: '01/20' }, {}),
    ).rejects.toMatchObject({ fieldErrors: { cardExpiry: expect.any(String) } });
    await expect(
      repo.payByCard(row.id, { method: 'card' }, { ...GOOD_CARD, cvc: '1' }, {}),
    ).rejects.toMatchObject({ fieldErrors: { cardCvc: expect.any(String) } });
  });

  it('supports an adjusted invoice amount, applied only once the card succeeds', async () => {
    const row = unpaidInvoice();
    const original = row.amount;
    const adjusted = original - 200_000;
    const key = { idempotencyKey: 'card-adjust' };
    const payment = { method: 'card', adjustedAmountMinor: adjusted, adjustmentReason: 'Discount' };
    await expect(
      repo.payByCard(row.id, payment, card('4000000000000002'), key),
    ).rejects.toBeTruthy();
    expect(row.amount).toBe(original);

    const paid = await repo.payByCard(row.id, payment, GOOD_CARD, key);
    expect(paid.amount.minor).toBe(adjusted);
    expect(paid.status).toBe('paid');
  });

  it('needs the payments.card permission', async () => {
    const row = unpaidInvoice();
    asRole('sales_manager');
    await expect(repo.payByCard(row.id, { method: 'card' }, GOOD_CARD, {})).rejects.toMatchObject({
      status: 403,
    });
  });

  it('never sends the card or our token to the EstateOps API', async () => {
    const row = unpaidInvoice();
    const bodies = [];
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/api/v1/')) bodies.push(String(init?.body ?? ''));
      return original(input, init);
    };
    try {
      await repo.payByCard(row.id, { method: 'card' }, GOOD_CARD, { idempotencyKey: 'card-pci' });
    } finally {
      globalThis.fetch = original;
    }
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.join(' ')).not.toMatch(/4242|"cvc"|"expiry"/);
  });
});
