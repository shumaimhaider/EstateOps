/** Starts the app, runs background workers, and shuts down cleanly on SIGTERM/SIGINT. */
export function startService({ app, port, logger, workers = [], onShutdown = async () => {} }) {
  const server = app.listen(port, () => logger.info({ port }, 'listening'));
  for (const worker of workers) worker.start();
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    for (const worker of workers) worker.stop();
    server.close(async () => {
      await onShutdown();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

/** A background job that never overlaps itself and never crashes the process. */
export function createInterval({ name, fn, everyMs, logger }) {
  let timer = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (error) {
      logger.error({ err: error, job: name }, 'job failed');
    } finally {
      running = false;
    }
  };
  return {
    start() {
      timer = setInterval(tick, everyMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
