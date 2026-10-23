import { newId, today as todayOf } from '@estateops/kernel';
import { COLLECTION_POLICY, attemptKeyFor, decideCollection } from '../domain/collectionPolicy.js';
import { collectionRequested } from './announce.js';

const PAGE = 500;

/**
 * The daily collection scan. It finds every unpaid invoice whose due date has come and whose
 * customer has a usable saved card, decides (from the invoice's attempt history) whether it is
 * time for a first charge or a retry, and writes one `payment.collection_requested` event per
 * invoice to the outbox. The payment worker, reading those events from Kafka, does the charging.
 *
 * Scanning never charges and never changes an invoice, and the attempt key is the same for every
 * repeat of the same attempt on the same day, so the scan can run any number of times, on any
 * number of replicas, without a double charge.
 */
export class CollectDueInvoices {
  constructor({ uow, clock, policy = COLLECTION_POLICY, pageSize = PAGE }) {
    Object.assign(this, { uow, clock, policy, pageSize });
  }

  async execute() {
    const today = todayOf(this.clock);
    const totals = { scanned: 0, requested: 0, retries: 0, skipped: {} };
    const skip = (totals_, reason) => {
      totals_.skipped[reason] = (totals_.skipped[reason] ?? 0) + 1;
    };
    const note = (row, fields) => ({
      id: newId(),
      tenantId: row.tenantId,
      runDate: today,
      invoiceId: row.invoiceId,
      bookingId: row.bookingId,
      customerId: row.customerId,
      amount: row.balance,
      currency: row.currency,
      ...fields,
    });

    // invoices the scan can charge: decide for each, and keep the decision for the history
    let after = null;
    for (;;) {
      const page = await this.uow.run(async (repos) => {
        const rows = await repos.collection.listCollectable(today, { after, limit: this.pageSize });
        const notes = [];
        for (const row of rows) {
          const decision = decideCollection(row, today, this.policy);
          if (!decision.attempt) {
            skip(totals, decision.skip);
            notes.push(
              note(row, {
                attemptKey: `${today}:skip`,
                attemptNo: 0,
                decision: 'skip',
                reason: decision.skip,
              }),
            );
            continue;
          }
          const attemptKey = attemptKeyFor(today, decision.attemptNo);
          notes.push(
            note(row, {
              attemptKey,
              attemptNo: decision.attemptNo,
              decision: 'charge',
              reason: decision.reason,
            }),
          );
          await repos.outbox.add(
            collectionRequested(
              {
                tenantId: row.tenantId,
                invoiceId: row.invoiceId,
                bookingId: row.bookingId,
                customerId: row.customerId,
                attemptKey,
                attemptNo: decision.attemptNo,
                reason: decision.reason,
              },
              this.clock.now(),
            ),
          );
          totals.requested += 1;
          if (decision.reason === 'retry') totals.retries += 1;
        }
        await repos.collectionAttempts.record(notes);
        totals.scanned += rows.length;
        return rows;
      });
      if (page.length < this.pageSize) break;
      after = page.at(-1).invoiceId;
    }

    // due invoices nobody can charge (no usable card): not attempted, and the history says why
    after = null;
    for (;;) {
      const page = await this.uow.run(async (repos) => {
        const rows = await repos.collection.listUncollectable(today, {
          after,
          limit: this.pageSize,
        });
        await repos.collectionAttempts.record(
          rows.map((row) =>
            note(row, {
              attemptKey: `${today}:skip`,
              attemptNo: 0,
              decision: 'skip',
              reason: row.reason,
            }),
          ),
        );
        for (const row of rows) skip(totals, row.reason);
        return rows;
      });
      if (page.length < this.pageSize) break;
      after = page.at(-1).invoiceId;
    }
    return totals;
  }
}
