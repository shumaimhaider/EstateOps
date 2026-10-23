import { describe, expect, it } from 'vitest';
import { createCollectionRunsRepository } from './collectionRuns.repository.js';

const run = {
  run_date: '2026-10-22',
  started_at: '2026-10-22T06:00:00.000Z',
  finished_at: '2026-10-22T06:01:00.000Z',
  error: null,
  invoices: 3,
  succeeded: 1,
  failed: 1,
  refunded: 0,
  skipped: 1,
  waiting: 0,
  collected_amount: 500000,
  failed_amount: 250000,
  currency: 'PKR',
};
const attempt = {
  id: 'a1',
  invoice_id: 'i1',
  invoice_no: 'INV-1',
  due_date: '2026-10-20',
  booking_id: 'b1',
  customer_id: 'c1',
  customer_name: 'Ali Raza',
  unit_no: 'A-01',
  project_name: 'Gulberg',
  attempt_no: 1,
  reason: 'due',
  amount: 250000,
  currency: 'PKR',
  status: 'failed',
  category: 'insufficient_funds',
  funds: 'insufficient',
  summary: 'Insufficient balance on the card',
  stripe_code: 'insufficient_funds',
  stripe_message: 'Your card has insufficient funds.',
  card_brand: 'visa',
  card_last4: '4242',
  stripe_payment_intent_id: 'pi_1',
  transaction_id: 't1',
  will_retry: true,
  retry_on: '2026-10-23',
  finished_at: '2026-10-22T06:00:05.000Z',
};

describe('collection runs repository', () => {
  it('turns the wire shape into UI names with money as integers plus currency', async () => {
    const calls = [];
    const repo = createCollectionRunsRepository({
      transport: {
        listDays: async (q) => (calls.push(q), { data: [run], next_before: '2026-10-22' }),
        listAttempts: async (date, q) => (
          calls.push({ date, ...q }),
          { data: [attempt], next_after: null, summary: run }
        ),
      },
    });
    const days = await repo.listDays({ before: '', limit: 10 });
    expect(days.items[0]).toMatchObject({
      runDate: '2026-10-22',
      collected: { minor: 500000, currency: 'PKR' },
      failedAmount: { minor: 250000, currency: 'PKR' },
    });
    expect(days.nextBefore).toBe('2026-10-22');
    expect(calls[0]).toEqual({ before: undefined, limit: 10 });

    const day = await repo.listAttempts('2026-10-22', { status: 'failed' });
    expect(day.items[0]).toMatchObject({
      customerName: 'Ali Raza',
      funds: 'insufficient',
      stripeCode: 'insufficient_funds',
      paymentIntentId: 'pi_1',
      willRetry: true,
      amount: { minor: 250000, currency: 'PKR' },
    });
    expect(day.summary.succeeded).toBe(1);
    expect(calls[1]).toMatchObject({ date: '2026-10-22', status: 'failed' });
  });

  it('rejects a response that does not match the contract', async () => {
    const repo = createCollectionRunsRepository({
      transport: { listDays: async () => ({ data: [{ run_date: 5 }], next_before: null }) },
    });
    await expect(repo.listDays()).rejects.toThrow();
  });
});
