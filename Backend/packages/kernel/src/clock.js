import { toDateString } from './dates.js';

/** Time comes from a port so business rules and tests never read the wall clock directly. */
export const systemClock = { now: () => new Date() };
export const fixedClock = (iso) => ({ now: () => new Date(iso) });
export const nowIso = (clock) => clock.now().toISOString();
export const today = (clock) => toDateString(clock.now().getTime());
