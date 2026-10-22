import { validator } from '@estateops/kernel';

export const DEFAULT_SETTINGS = Object.freeze({ graceDays: 5, escalationMissed: 3 });

/** Days after the due date before an invoice is overdue, and how many overdue invoices escalate a booking. */
export function createSettings(input) {
  const v = validator('The collection settings could not be saved');
  v.check(
    Number.isInteger(input.graceDays) && input.graceDays >= 0 && input.graceDays <= 60,
    'grace_days',
    'Use 0 to 60 days',
  );
  v.check(
    Number.isInteger(input.escalationMissed) &&
      input.escalationMissed >= 1 &&
      input.escalationMissed <= 24,
    'escalation_missed',
    'Use 1 to 24 missed installments',
  );
  v.done();
  return { graceDays: input.graceDays, escalationMissed: input.escalationMissed };
}
