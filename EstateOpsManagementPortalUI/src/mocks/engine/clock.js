/**
 * Simulated clock. `simStart` is the fixed point seed data is relative to; the clock then
 * advances with real time plus a manual offset (advanced from the simulation panel).
 */
export const SIM_START = '2026-10-21T09:00:00.000Z';

export function createClock() {
  return { simStart: SIM_START, realStart: Date.now(), offsetMs: 0 };
}

export function nowMs(clock) {
  return Date.parse(clock.simStart) + (Date.now() - clock.realStart) + clock.offsetMs;
}

export function nowIso(clock) {
  return new Date(nowMs(clock)).toISOString();
}

export function advanceClock(clock, ms) {
  clock.offsetMs += ms;
}
