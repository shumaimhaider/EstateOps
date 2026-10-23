/**
 * How an automatic-collection attempt reads to a person: what happened, why, and whether the
 * customer's card had the money. Pure; the repository supplies the facts.
 */
const FAILURES = {
  insufficient_funds: {
    category: 'insufficient_funds',
    funds: 'insufficient',
    label: 'Insufficient balance on the card',
  },
  card_declined: {
    category: 'card_declined',
    funds: 'unknown',
    label: 'The bank declined the card',
  },
  generic_decline: {
    category: 'card_declined',
    funds: 'unknown',
    label: 'The bank declined the card',
  },
  do_not_honor: {
    category: 'card_declined',
    funds: 'unknown',
    label: 'The bank declined the card',
  },
  expired_card: { category: 'card_expired', funds: 'unknown', label: 'The card has expired' },
  CARD_EXPIRED: { category: 'card_expired', funds: 'unknown', label: 'The saved card has expired' },
  NO_ACTIVE_CARD: { category: 'no_card', funds: 'unknown', label: 'No saved card to charge' },
  authentication_required: {
    category: 'authentication_required',
    funds: 'unknown',
    label: 'The bank needs the customer to confirm the payment',
  },
  incorrect_cvc: {
    category: 'card_declined',
    funds: 'unknown',
    label: 'The security code was wrong',
  },
  lost_card: { category: 'card_blocked', funds: 'unknown', label: 'The card was reported lost' },
  stolen_card: {
    category: 'card_blocked',
    funds: 'unknown',
    label: 'The card was reported stolen',
  },
  processing_error: {
    category: 'processing_error',
    funds: 'unknown',
    label: 'Stripe could not process the charge',
  },
};

const SKIPS = {
  no_card: 'The customer has no saved card',
  card_expired: 'The saved card has expired',
  in_flight: 'A charge for this invoice is still being processed',
  waiting: 'Waiting before the next retry',
  gave_up: 'Gave up after the maximum number of attempts',
  needs_new_card: 'The last failure cannot be fixed by retrying: the customer must update the card',
};

/** The shown status of one attempt, from the scan's decision and the ledger row if there is one. */
export function attemptStatus({ decision, transactionStatus }) {
  if (decision === 'skip') return 'skipped';
  if (!transactionStatus) return 'queued';
  return transactionStatus === 'pending' ? 'in_progress' : transactionStatus;
}

/**
 * @returns {{ status, category, funds: 'sufficient'|'insufficient'|'unknown'|null, summary }}
 * `funds` is only known for sure when Stripe says so: a successful charge proves the money was
 * there, `insufficient_funds` proves it was not, any other failure says nothing about the balance.
 */
export function describeAttempt({
  decision,
  reason,
  transactionStatus,
  failureCode,
  failureMessage,
}) {
  const status = attemptStatus({ decision, transactionStatus });
  if (status === 'skipped') {
    return { status, category: reason, funds: null, summary: SKIPS[reason] ?? 'Not attempted' };
  }
  if (status === 'succeeded')
    return { status, category: 'paid', funds: 'sufficient', summary: 'Charged successfully' };
  if (status === 'refunded') {
    return {
      status,
      category: 'refunded',
      funds: 'sufficient',
      summary: 'Charged, then refunded because the invoice changed meanwhile',
    };
  }
  if (status === 'failed') {
    const known = FAILURES[failureCode];
    return {
      status,
      category: known?.category ?? 'other',
      funds: known?.funds ?? 'unknown',
      summary: known?.label ?? failureMessage ?? 'The charge failed',
    };
  }
  return {
    status,
    category: status,
    funds: null,
    summary: status === 'queued' ? 'Waiting for the payment worker' : 'Being processed',
  };
}
