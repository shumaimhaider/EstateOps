import { describe, expect, it, vi } from 'vitest';
import { createDailyJob } from '../src/index.js';

const logger = { info: vi.fn(), error: vi.fn() };
const at = (iso) => ({ clock: new Date(iso) });

function build({
  time = '2026-10-21T05:00:00Z',
  claimResult = true,
  run = async () => ({ n: 1 }),
} = {}) {
  const state = { time: new Date(time), claimed: [], finished: [], released: [] };
  const job = createDailyJob({
    name: 'collect',
    at: '06:00',
    run: vi.fn(run),
    claim: async (d) => (state.claimed.push(d), claimResult),
    finish: async (d, r) => void state.finished.push([d, r]),
    release: async (d) => void state.released.push(d),
    logger,
    now: () => state.time,
    retryAfterMs: 60_000,
  });
  return { job, state, at: (iso) => (state.time = new Date(iso)) };
}

describe('daily job', () => {
  it('waits for its time, runs once that day and then stays quiet', async () => {
    const { job, state, at: setTime } = build();
    expect(await job.tick()).toBe('early');
    setTime('2026-10-21T06:00:30Z');
    expect(await job.tick()).toBe('ran');
    expect(state.finished).toEqual([['2026-10-21', { result: { n: 1 } }]]);
    expect(await job.tick()).toBe('done');
    setTime('2026-10-22T06:10:00Z');
    expect(await job.tick()).toBe('ran');
    expect(state.claimed).toEqual(['2026-10-21', '2026-10-22']);
  });

  it('stands down when another replica has the day', async () => {
    const { job, state } = build({ time: '2026-10-21T07:00:00Z', claimResult: false });
    expect(await job.tick()).toBe('taken');
    expect(await job.tick()).toBe('done');
    expect(state.finished).toEqual([]);
  });

  it('releases the claim on failure and tries again after the back-off', async () => {
    let calls = 0;
    const {
      job,
      state,
      at: setTime,
    } = build({
      time: '2026-10-21T07:00:00Z',
      run: async () => {
        calls += 1;
        if (calls === 1) throw new Error('database down');
        return { n: 2 };
      },
    });
    expect(await job.tick()).toBe('failed');
    expect(state.released).toEqual(['2026-10-21']);
    expect(state.finished[0][1]).toEqual({ error: 'database down' });
    expect(await job.tick()).toBe('backoff');
    setTime('2026-10-21T07:02:00Z');
    expect(await job.tick()).toBe('ran');
  });

  it('does not overlap itself', async () => {
    let release;
    const slow = new Promise((r) => (release = r));
    const { job } = build({ time: '2026-10-21T07:00:00Z', run: () => slow });
    const first = job.tick();
    expect(await job.tick()).toBe('busy');
    release({});
    expect(await first).toBe('ran');
  });

  it('starts and stops its timer', () => {
    vi.useFakeTimers();
    const { job } = build();
    job.start();
    job.stop();
    vi.useRealTimers();
    expect(at('2026-10-21T00:00:00Z').clock).toBeInstanceOf(Date);
  });
});
