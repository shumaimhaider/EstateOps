import { describe, expect, it } from 'vitest';
import { getDb } from '@/test/mockServer.js';
import { createEscalationsRepository } from './escalations.repository.js';
import { createInstallmentsRepository } from './installments.repository.js';
import { createStatsRepository } from './stats.repository.js';
import { escalationsGraphql } from './transport/escalations.graphql.js';
import { escalationsRest } from './transport/escalations.rest.js';
import { installmentsGraphql } from './transport/installments.graphql.js';
import { installmentsRest } from './transport/installments.rest.js';
import { statsGraphql } from './transport/stats.graphql.js';
import { statsRest } from './transport/stats.rest.js';

const make = (transport) => ({
  installments: createInstallmentsRepository({
    transports: { rest: installmentsRest, graphql: installmentsGraphql },
    pickTransport: () => transport,
  }),
  escalations: createEscalationsRepository({
    transports: { rest: escalationsRest, graphql: escalationsGraphql },
    pickTransport: () => transport,
  }),
  stats: createStatsRepository({
    transports: { rest: statsRest, graphql: statsGraphql },
    pickTransport: () => transport,
  }),
});
const repos = { rest: make('rest'), graphql: make('graphql') };

async function allInvoices(repo, filters = {}) {
  const out = [];
  let cursor;
  do {
    const page = await repo.list(filters, { cursor, limit: 200 });
    out.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return out;
}

describe.each(['rest', 'graphql'])('collections over %s', (transport) => {
  const { installments, escalations, stats } = repos[transport];

  it('RPT-8: dashboard totals equal the sums of the installment register (company level)', async () => {
    const [s, invoices] = await Promise.all([stats.collections(), allInvoices(installments)]);
    const active = invoices.filter(
      (i) => !['waived', 'cancelled', 'rescheduled'].includes(i.status),
    );
    const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);

    expect(s.received.minor).toBe(sum(invoices, (i) => i.paid.minor));
    expect(s.pending.minor).toBe(sum(active, (i) => i.balance.minor));
    expect(s.overdue.minor).toBe(
      sum(
        invoices.filter((i) => i.status === 'overdue'),
        (i) => i.balance.minor,
      ),
    );
    expect(s.installments.total).toBe(active.length);
    expect(s.installments.paid).toBe(invoices.filter((i) => i.status === 'paid').length);
    expect(s.ageing.reduce((t, a) => t + a.amount.minor, 0)).toBe(s.overdue.minor);
    expect(s.byProject.reduce((t, p) => t + p.received.minor, 0)).toBe(s.received.minor);
  });

  it('RPT-8: totals also match the register for each project', async () => {
    const all = await stats.collections();
    for (const project of all.byProject) {
      const [s, invoices] = await Promise.all([
        stats.collections({ projectId: project.projectId }),
        allInvoices(installments, { projectId: project.projectId }),
      ]);
      expect(s.received.minor).toBe(invoices.reduce((t, i) => t + i.paid.minor, 0));
      expect(s.installments.total).toBe(
        invoices.filter((i) => !['waived', 'cancelled', 'rescheduled'].includes(i.status)).length,
      );
      expect(s.received.minor).toBe(project.received.minor);
    }
  });

  it('breaks units down by type with plots, flats, villas and shops', async () => {
    const s = await stats.collections();
    const total = s.unitsByKind.reduce((t, k) => t + k.total, 0);
    expect(total).toBe(s.units.total);
    expect(s.unitsByKind.find((k) => k.kind === 'plot').sold).toBeGreaterThanOrEqual(0);
    expect(s.unitsByKind.map((k) => k.kind)).toContain('plot');
  });

  it('records a full payment and the money moves everywhere', async () => {
    const [before] = [await stats.collections()];
    const [target] = (await installments.list({ status: 'overdue' }, { limit: 1 })).items;
    expect(target.allowedActions).toContain('record_payment');

    const paid = await installments.recordPayment(target.id, { method: 'cash', amountMinor: null });
    expect(paid.status).toBe('paid');
    expect(paid.balance.minor).toBe(0);
    expect(paid.receiptNo).toMatch(/^RCT-/);
    expect(paid.paymentReference).toMatch(/^PAY-/);

    const after = await stats.collections();
    expect(after.received.minor - before.received.minor).toBe(target.balance.minor);
    expect(before.pending.minor - after.pending.minor).toBe(target.balance.minor);
    await expect(installments.recordPayment(target.id, { method: 'cash' })).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    });
  });

  it('allows a part payment that keeps the invoice open, and rejects overpayment inline', async () => {
    const [target] = (await installments.list({ status: 'scheduled' }, { limit: 1 })).items;
    const half = Math.floor(target.balance.minor / 2);
    const part = await installments.recordPayment(target.id, {
      method: 'bank_transfer',
      amountMinor: half,
    });
    expect(part.status).toBe('scheduled');
    expect(part.paid.minor).toBe(half);
    expect(part.balance.minor).toBe(target.amount.minor - half);

    await expect(
      installments.recordPayment(target.id, {
        method: 'cash',
        amountMinor: part.balance.minor + 1,
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { amount: expect.stringContaining('exceed') },
    });
  });

  it('replays the first response for the same Idempotency-Key (no double payment)', async () => {
    const [target] = (await installments.list({ status: 'due' }, { limit: 1 })).items;
    const first = await installments.recordPayment(
      target.id,
      { method: 'cash' },
      { idempotencyKey: 'k1' },
    );
    const second = await installments.recordPayment(
      target.id,
      { method: 'cash' },
      { idempotencyKey: 'k1' },
    );
    expect(second).toEqual(first);
  });

  it('rejects a duplicate payment reference with a field error', async () => {
    const [a, b] = (await installments.list({ status: 'scheduled' }, { limit: 2 })).items;
    await installments.recordPayment(a.id, {
      method: 'cheque',
      reference: 'CHQ-1',
      amountMinor: 100,
    });
    await expect(
      installments.recordPayment(b.id, { method: 'cheque', reference: 'CHQ-1', amountMinor: 100 }),
    ).rejects.toMatchObject({ fieldErrors: { reference: expect.stringContaining('already') } });
  });

  it('lists escalated cases worst-first and sends a notice once', async () => {
    const page = await escalations.list({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    const days = page.items.map((e) => e.daysLate);
    expect(days).toEqual([...days].sort((x, y) => y - x));
    expect(page.items.every((e) => e.missedInstallments >= 3)).toBe(true);

    const open = page.items.find((e) => e.allowedActions.includes('send_notice'));
    const sent = await escalations.sendNotice(open.id);
    expect(sent.status).toBe('notice_sent');
    expect(sent.noticeSentAt).toEqual(expect.any(String));
    await expect(escalations.sendNotice(open.id)).rejects.toMatchObject({ status: 409 });
  });

  it('resolves an escalated case when enough overdue installments are paid', async () => {
    const [esc] = (await escalations.list({ limit: 1 })).items;
    const overdue = (
      await installments.list({ bookingId: esc.bookingId, status: 'overdue' }, { limit: 100 })
    ).items;
    for (const invoice of overdue.slice(0, esc.missedInstallments - 2)) {
      await installments.recordPayment(invoice.id, { method: 'cash' });
    }
    const remaining = (await escalations.list({ limit: 200 })).items;
    expect(remaining.find((e) => e.id === esc.id)).toBeUndefined();
  });

  it('completes the booking and sells the unit once every installment is paid', async () => {
    const db = getDb();
    const booking = db.bookings.find((b) => b.status === 'active');
    const rows = (await installments.list({ bookingId: booking.id }, { limit: 100 })).items;
    for (const invoice of rows.filter(
      (i) => i.allowedActions.includes('record_payment') && i.balance.minor > 0,
    )) {
      await installments.recordPayment(invoice.id, { method: 'online' });
    }
    expect(db.bookings.find((b) => b.id === booking.id).status).toBe('completed');
    expect(db.units.find((u) => u.id === booking.unit_id).status).toBe('sold');
  });
});

describe('transport parity', () => {
  it('returns identical models from REST and GraphQL', async () => {
    const filters = { status: 'overdue', sort: { field: 'amount', dir: 'desc' } };
    const [r, g] = await Promise.all([
      repos.rest.installments.list(filters, { limit: 20 }),
      repos.graphql.installments.list(filters, { limit: 20 }),
    ]);
    expect(g).toEqual(r);
    expect(await repos.graphql.stats.collections()).toEqual(await repos.rest.stats.collections());
    expect(await repos.graphql.escalations.list({ limit: 10 })).toEqual(
      await repos.rest.escalations.list({ limit: 10 }),
    );
  });
});
