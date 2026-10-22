/** Schema and identifier helpers for the few raw SQL statements in infrastructure code. */
const IDENT = /^[a-z_][a-z0-9_]*$/;

export function ident(name) {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `"${name}"`;
}

export const table = (schema, name) => `${ident(schema)}.${ident(name)}`;

/**
 * TypeORM's `query()` returns plain rows for SELECT and INSERT, but `[rows, affectedCount]` for
 * UPDATE and DELETE ... RETURNING. This gives the rows either way.
 */
export const rowsOf = (result) =>
  Array.isArray(result) &&
  result.length === 2 &&
  Array.isArray(result[0]) &&
  typeof result[1] === 'number'
    ? result[0]
    : result;

/** PostgreSQL error codes the repositories translate into domain conflicts. */
export const PG = Object.freeze({
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  CHECK: '23514',
  SERIALIZATION: '40001',
  DEADLOCK: '40P01',
});

/** TypeORM wraps the driver error; the code lives on `driverError` or the error itself. */
export const pgCode = (error) => error?.driverError?.code ?? error?.code;
export const pgConstraint = (error) => error?.driverError?.constraint ?? error?.constraint;
