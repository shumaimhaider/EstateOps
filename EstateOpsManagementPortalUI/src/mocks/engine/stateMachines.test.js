import { describe, expect, it } from 'vitest';
import { allowedActions, MACHINES, transition } from './stateMachines.js';

describe('state machines', () => {
  it('allows listed unit transitions and rejects the rest with 409 INVALID_TRANSITION', () => {
    expect(transition('unit', 'available', 'block')).toBe('blocked');
    expect(transition('unit', 'blocked', 'unblock')).toBe('available');
    expect(() => transition('unit', 'sold', 'block')).toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }),
    );
    expect(() => transition('unit', 'available', 'sell')).toThrowError(/Cannot sell/);
  });

  it('never offers system-only transitions to staff', () => {
    expect(allowedActions('unit', { status: 'held' })).toEqual(['release']);
    expect(allowedActions('unit', { status: 'booked' })).toEqual([]);
  });

  it('follows the installment rules: overdue can be paid or rescheduled, paid reopens only by system', () => {
    expect(transition('installment', 'overdue', 'pay')).toBe('paid');
    expect(transition('installment', 'overdue', 'reschedule')).toBe('rescheduled');
    expect(allowedActions('installment', { status: 'paid' })).toEqual([]);
    expect(MACHINES.installment.scheduled.pay).toBeUndefined();
  });

  it('lets a lead move between any two different stages', () => {
    expect(transition('lead_stage', 'new', 'move_visit_booked')).toBe('visit_booked');
    expect(() => transition('lead_stage', 'new', 'move_new')).toThrow();
  });
});
