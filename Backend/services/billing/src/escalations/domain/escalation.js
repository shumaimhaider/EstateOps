import { ConflictError, InvalidTransitionError } from '@estateops/kernel';

/**
 * An escalated case is a booking with `threshold` or more overdue installments. One notice letter
 * can be sent per case; paying down the overdue installments makes the case disappear.
 */
export const isEscalated = (overdueCount, threshold) => overdueCount >= threshold;

export function assertCanSendNotice({ overdueCount, threshold, noticeSent }) {
  if (!isEscalated(overdueCount, threshold))
    throw new InvalidTransitionError('This booking is no longer escalated');
  if (noticeSent) throw new ConflictError('NOTICE_ALREADY_SENT', 'A notice has already been sent');
}
