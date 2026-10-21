/**
 * Server-truth state machines (brief section 4). Each machine is a table:
 *   state -> action -> { to, system? }
 * `system: true` transitions are fired by the engine/scheduler/external events, never
 * offered to staff. The UI never duplicates these rules: it renders `allowed_actions`.
 */
import { MockApiError } from './errors.js';

const t = (to, system = false) => ({ to, system });

export const MACHINES = {
  unit: {
    available: { hold: t('held'), block: t('blocked') },
    held: { release: t('available'), expire: t('available', true), book: t('booked', true) },
    booked: { sell: t('sold', true), cancel_release: t('available', true) },
    sold: {},
    blocked: { unblock: t('available') },
  },
  hold: {
    active: {
      release: t('released'),
      expire: t('expired', true),
      convert: t('converted', true),
    },
    released: {},
    expired: {},
    converted: {},
  },
  booking: {
    requested: { review: t('in_review'), confirm: t('confirmed') },
    in_review: { confirm: t('confirmed') },
    confirmed: { sign: t('active', true), cancel: t('cancelled', true) },
    active: { complete: t('completed', true), cancel: t('cancelled', true) },
    completed: {},
    cancelled: {},
  },
  installment: {
    scheduled: {
      activate: t('due', true),
      record_payment: t('paid'),
      waive: t('waived'),
      cancel: t('cancelled'),
    },
    due: {
      pay: t('paid', true),
      record_payment: t('paid'),
      mark_overdue: t('overdue', true),
      waive: t('waived'),
      cancel: t('cancelled'),
    },
    overdue: {
      pay: t('paid', true),
      record_payment: t('paid'),
      reschedule: t('rescheduled'),
      waive: t('waived'),
      cancel: t('cancelled'),
    },
    paid: { reopen: t('due', true) },
    rescheduled: {},
    waived: {},
    cancelled: {},
  },
  document: {
    draft: { send: t('sent'), revise: t('voided'), void: t('voided') },
    sent: {
      view: t('viewed', true),
      sign: t('signed', true),
      decline: t('declined', true),
      revise: t('voided'),
      void: t('voided'),
    },
    viewed: {
      sign: t('signed', true),
      decline: t('declined', true),
      revise: t('voided'),
      void: t('voided'),
    },
    signed: { void: t('voided') },
    declined: { revise: t('voided'), void: t('voided') },
    voided: {},
  },
  bank_proof: {
    pending: { match: t('matched'), reject: t('rejected') },
    matched: {},
    rejected: {},
  },
  visit: {
    booked: {
      complete: t('completed'),
      no_show: t('no_show'),
      cancel: t('cancelled'),
      reschedule: t('rescheduled'),
    },
    rescheduled: { complete: t('completed'), no_show: t('no_show'), cancel: t('cancelled') },
    completed: {},
    no_show: {},
    cancelled: {},
  },
  dealer: {
    pending: { approve: t('active'), reject: t('rejected') },
    active: { suspend: t('suspended') },
    suspended: { reinstate: t('active') },
    rejected: {},
  },
  commission_accrual: {
    pending: { earn: t('earned', true), reverse: t('reversed', true) },
    earned: { approve: t('approved'), reverse: t('reversed', true) },
    approved: { pay: t('paid', true), reverse: t('reversed', true) },
    paid: { reverse: t('reversed', true) },
    reversed: {},
  },
  price_list: {
    draft: { submit: t('pending_approval') },
    pending_approval: { approve: t('approved'), reject: t('rejected') },
    approved: {},
    rejected: {},
  },
  approval: {
    pending: { approve: t('approved'), reject: t('rejected') },
    approved: {},
    rejected: {},
  },
  message: {
    queued: { send: t('sent', true) },
    sent: { deliver: t('delivered', true), fail: t('failed', true) },
    delivered: { read: t('read', true) },
    failed: { fallback: t('queued', true) },
    read: {},
  },
};

const LEAD_STAGES = [
  'new',
  'contacted',
  'visit_booked',
  'visited',
  'negotiation',
  'booked',
  'lost',
];
// Kanban: a lead may be dragged to any other stage.
MACHINES.lead_stage = Object.fromEntries(
  LEAD_STAGES.map((from) => [
    from,
    Object.fromEntries(LEAD_STAGES.filter((to) => to !== from).map((to) => [`move_${to}`, t(to)])),
  ]),
);

/** Applies `action` to `state` or throws 409 INVALID_TRANSITION. Returns the next state. */
export function transition(machine, state, action) {
  const next = MACHINES[machine]?.[state]?.[action];
  if (!next) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot ${action} a ${machine.replace('_', ' ')} that is ${state}`,
    );
  }
  return next.to;
}

/** Permission a staff action needs on top of the state machine. Unlisted actions are open. */
const ACTION_PERMISSIONS = {
  'document.send': 'contracts.manage',
  'document.revise': 'contracts.manage',
  'document.void': 'contracts.manage',
};

/**
 * Actions staff may perform on a record right now: system transitions are excluded and so is
 * anything the user's role lacks. A user without a permission list (tests) is not filtered.
 */
export function allowedActions(machine, record, user) {
  const actions = MACHINES[machine]?.[record.status] ?? {};
  return Object.entries(actions)
    .filter(([, def]) => !def.system)
    .map(([name]) => name)
    .filter((name) => {
      const needed = ACTION_PERMISSIONS[`${machine}.${name}`];
      return !needed || !user?.permissions || user.permissions.includes(needed);
    });
}
