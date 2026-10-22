import { buildCommonRepos } from './commonRepos.js';
import { PG, pgCode } from './sql.js';

/** A deadlock or a serialization failure rolls the transaction back and is safe to try again. */
export const isRetryable = (error) => [PG.DEADLOCK, PG.SERIALIZATION].includes(pgCode(error));

/**
 * Runs `work` again when the database aborts it as a deadlock victim, up to `attempts` times with a
 * short random pause. Anything else fails at once. `work` must be safe to repeat, which holds for a
 * unit of work because a failed attempt rolled all of its changes back.
 */
export async function withRetry(
  work,
  {
    attempts = 3,
    pauseMs = 25,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;
      await sleep(pauseMs * attempt * (0.5 + Math.random()));
    }
  }
}

/**
 * Unit of work over TypeORM. `run` is one database transaction: the aggregate, its audit entries
 * and its outbox events commit or roll back together. `read` uses the read replica when one is
 * configured and no transaction. A transaction that loses a deadlock is retried a few times.
 *
 * `buildRepos(manager)` returns the service's own repositories bound to that manager.
 */
export function createTypeormUow({ dataSource, readDataSource = null, schema, buildRepos }) {
  const bind = (manager) => ({ ...buildRepos(manager), ...buildCommonRepos(manager, { schema }) });
  return {
    run: (work) =>
      withRetry(() => dataSource.transaction('READ COMMITTED', (manager) => work(bind(manager)))),
    read: (work) => work(bind((readDataSource ?? dataSource).manager)),
  };
}
