import { PERMISSION, assertCan, today as todayOf } from '@estateops/kernel';
import { nextRetry } from '../domain/collectionPolicy.js';
import { describeAttempt } from '../domain/collectionReport.js';

/** Day by day: when the automatic collection ran and how many invoices it charged, failed and skipped. */
export class ListCollectionRuns {
  constructor({ uow }) {
    Object.assign(this, { uow });
  }

  async execute({ actor, before = null, limit = 31 }) {
    assertCan(actor, PERMISSION.STATS_VIEW);
    const days = await this.uow.read((repos) =>
      repos.collectionAttempts.listDays(actor.tenantId, { before, limit: Math.min(limit, 62) }),
    );
    return {
      items: days,
      nextBefore: days.length === Math.min(limit, 62) ? days.at(-1).runDate : null,
    };
  }
}

/**
 * One day's invoices with their outcome: charged, failed (and why: the bank's reason, whether the
 * balance was short, whether a retry is planned), refunded, or skipped (and why). Totals for the
 * whole day come with the page so the screen can show them without loading everything.
 */
export class ListCollectionAttempts {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, runDate, status = null, after = null, limit = 100 }) {
    assertCan(actor, PERMISSION.STATS_VIEW);
    const day = runDate === 'today' ? todayOf(this.clock) : runDate;
    const { rows, summary } = await this.uow.read(async (repos) => ({
      rows: await repos.collectionAttempts.listForDay(actor.tenantId, day, {
        status,
        after,
        limit: Math.min(limit, 200),
      }),
      summary: (
        await repos.collectionAttempts.listDays(actor.tenantId, { before: nextDay(day), limit: 1 })
      )[0],
    }));
    const items = rows.map((r) => {
      const what = describeAttempt({
        decision: r.decision,
        reason: r.reason,
        transactionStatus: r.transactionStatus,
        failureCode: r.failureCode,
        failureMessage: r.failureMessage,
      });
      const retry =
        what.status === 'failed'
          ? nextRetry(r.attemptNo, r.failureCode, day)
          : { willRetry: false, retryOn: null };
      return { ...r, ...what, willRetry: retry.willRetry, retryOn: retry.retryOn };
    });
    return {
      items,
      nextAfter: rows.length === Math.min(limit, 200) ? rows.at(-1).id : null,
      summary: summary?.runDate === day ? summary : null,
    };
  }
}

const nextDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};
