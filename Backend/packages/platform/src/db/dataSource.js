import pg from 'pg';
import { DataSource } from 'typeorm';

// Dates stay 'YYYY-MM-DD' strings: node-pg would otherwise build a local-time Date and a timezone
// east of UTC could shift the day. bigint (money in minor units) becomes a number, which is exact
// up to 2^53 (about 9e15 minor units).
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`bigint ${value} does not fit in a safe integer`);
  return n;
});

/**
 * One TypeORM DataSource per service. The SQL file owns the schema, so `synchronize` is off.
 * Entities are `EntitySchema` objects (no decorators on domain classes).
 */
export function createDataSource({ url, entities, poolSize = 10, logging = false }) {
  return new DataSource({
    type: 'postgres',
    url,
    entities,
    synchronize: false,
    logging,
    extra: { max: poolSize, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 },
  });
}

export async function connect(dataSource) {
  if (!dataSource.isInitialized) await dataSource.initialize();
  return dataSource;
}
