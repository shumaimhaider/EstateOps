import { InvalidTransitionError } from './errors.js';

/**
 * A state machine as a table: state -> action -> { to, system }. `system` transitions are driven
 * by events or jobs and are never offered to staff.
 */
export const to = (state, system = false) => ({ to: state, system });

export function defineMachine(name, table) {
  return {
    name,
    states: Object.keys(table),
    /** Next state or throws 409 INVALID_TRANSITION. */
    transition(state, action) {
      const next = table[state]?.[action];
      if (!next) throw new InvalidTransitionError(`Cannot ${action} a ${name} that is ${state}`);
      return next.to;
    },
    can: (state, action) => Boolean(table[state]?.[action]),
    /** Actions staff may take in `state` (system transitions excluded). */
    staffActions: (state) =>
      Object.entries(table[state] ?? {})
        .filter(([, def]) => !def.system)
        .map(([action]) => action),
  };
}
