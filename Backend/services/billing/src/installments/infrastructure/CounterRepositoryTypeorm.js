import { rowsOf } from '@estateops/platform';

/** Gap-free per-tenant numbering. The row lock lives only as long as the caller's transaction. */
export class CounterRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  /** Reserves `count` consecutive numbers and returns the LAST one. A rollback gives them back. */
  async next(tenantId, name, count = 1) {
    const rows = rowsOf(
      await this.manager.query(
        `INSERT INTO billing.counter (tenant_id, name, value) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, name) DO UPDATE SET value = billing.counter.value + $3
         RETURNING value`,
        [tenantId, name, count],
      ),
    );
    return rows[0].value;
  }
}
