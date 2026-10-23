/**
 * A job that runs once a day at `at` ("HH:MM", UTC) on exactly one replica. Every replica ticks;
 * the first to `claim(date)` wins the day and runs it, the others see it taken and stand down.
 * A failed run releases the claim and is tried again after `retryAfterMs`, so a bad minute at
 * 06:00 does not cost the whole day. `run` must be safe to repeat.
 *
 *   claim(date)  -> boolean        finish(date, { result?, error? })        release(date)
 */
export function createDailyJob({
  name,
  at = '06:00',
  run,
  claim,
  finish,
  release,
  logger,
  now = () => new Date(),
  tickMs = 30_000,
  retryAfterMs = 5 * 60_000,
}) {
  let doneFor = null;
  let retryAt = 0;
  let busy = false;
  let timer = null;

  async function tick() {
    if (busy) return 'busy';
    const moment = now();
    const date = moment.toISOString().slice(0, 10);
    if (date === doneFor) return 'done';
    if (moment.toISOString().slice(11, 16) < at) return 'early';
    if (moment.getTime() < retryAt) return 'backoff';
    busy = true;
    try {
      if (!(await claim(date))) {
        doneFor = date; // another replica has this day
        return 'taken';
      }
      try {
        const result = await run();
        await finish(date, { result });
        doneFor = date;
        logger.info({ job: name, date, result }, 'daily job finished');
        return 'ran';
      } catch (error) {
        logger.error({ err: error, job: name, date }, 'daily job failed, will retry');
        await finish(date, { error: error.message }).catch(() => {});
        await release(date).catch(() => {});
        retryAt = now().getTime() + retryAfterMs;
        return 'failed';
      }
    } finally {
      busy = false;
    }
  }

  return {
    tick,
    start() {
      timer = setInterval(
        () => tick().catch((e) => logger.error({ err: e, job: name }, 'daily job tick failed')),
        tickMs,
      );
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
