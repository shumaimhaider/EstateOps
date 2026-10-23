import { ConflictError, InvalidTransitionError, NotFoundError } from '@estateops/kernel';
import { ChargeSavedCard } from './ChargeSavedCard.js';

/**
 * The payment worker. It receives `payment.collection_requested` (from Kafka, or over HTTP when
 * no broker is used) and charges that invoice to the customer's saved card with the same use case
 * the management portal uses. A request that no longer applies (the invoice was paid or waived in
 * the meantime, or was removed) is dropped quietly; anything else is raised so it is retried and,
 * in the end, dead-lettered. Repeats are harmless: the attempt key makes the charge idempotent.
 */
export class ProcessCollectionRequest {
  constructor(deps) {
    this.charge = new ChargeSavedCard(deps);
    this.logger = deps.logger;
  }

  async execute(event) {
    const d = event.data;
    try {
      const result = await this.charge.execute({
        tenantId: event.tenant_id,
        id: d.invoice_id,
        trigger: 'scheduled',
        attemptKey: d.attempt_key,
      });
      return {
        outcome: result.repeated
          ? 'repeat'
          : result.failed
            ? 'failed'
            : result.refunded
              ? 'refunded'
              : 'paid',
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof InvalidTransitionError) {
        return { outcome: 'dropped', reason: error.message };
      }
      if (error instanceof ConflictError && error.code === 'ATTEMPT_ALREADY_MADE') {
        return { outcome: 'repeat' };
      }
      throw error;
    }
  }
}
