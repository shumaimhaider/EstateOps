import { clampLimit, decodeCursor, encodeCursor } from '@estateops/kernel';

/**
 * A tiny parameterised-SQL builder. Write `?` where a value goes; values are passed separately
 * and numbered ($1, $2, ...), so user input never reaches the SQL text.
 *   const q = createQuery();
 *   q.and('u.tenant_id = ?', tenantId);
 *   q.and('u.status = ?', status);   // only called when the filter is present
 */
export function createQuery() {
  const clauses = [];
  const params = [];
  const bind = (sql, values) => {
    let i = 0;
    return sql.replace(/\?/g, () => {
      if (i >= values.length) throw new Error(`Missing value for placeholder in: ${sql}`);
      params.push(values[i]);
      i += 1;
      return `$${params.length}`;
    });
  };
  return {
    params,
    /** Adds an AND condition. */
    and(sql, ...values) {
      clauses.push(bind(sql, values));
      return this;
    },
    /** Binds a value outside a WHERE clause and returns its `$n`. */
    param(value) {
      params.push(value);
      return `$${params.length}`;
    },
    /** Binds placeholders in any SQL fragment (JOIN conditions, expressions). */
    sql: (fragment, ...values) => bind(fragment, values),
    where: () => (clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''),
  };
}

/** Escapes LIKE wildcards so user text matches literally. */
export const likeContains = (text) => `%${String(text).replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Keyset-paginated SELECT. `select` is the column list, `from` the FROM/JOIN text, `query` a
 * `createQuery()` holding the filters. The sort expression and id column must be NOT NULL.
 * Rows come back with their original columns; the sort value and id are read through
 * `valueOf(row)` and `idOf(row)` to build the next cursor.
 *
 * @returns {{ rows: object[], nextCursor: string|null }}
 */
export async function keysetSql(
  manager,
  { select, from, query, sort, idExpr, cursor, limit, valueOf, idOf },
) {
  const size = clampLimit(limit);
  const after = decodeCursor(cursor);
  const dir = sort.dir === 'desc' ? 'DESC' : 'ASC';
  if (after) {
    const op = sort.dir === 'desc' ? '<' : '>';
    const v = query.param(after.v);
    const id = query.param(after.id);
    query.and(
      `(${sort.expr}, ${idExpr}) ${op} (CAST(${v} AS ${sort.cast ?? 'text'}), CAST(${id} AS uuid))`,
    );
  }
  const rows = await manager.query(
    `SELECT ${select} ${from} ${query.where()} ORDER BY ${sort.expr} ${dir}, ${idExpr} ${dir} LIMIT ${size + 1}`,
    query.params,
  );
  const more = rows.length > size;
  const page = more ? rows.slice(0, size) : rows;
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: more && last ? encodeCursor({ v: valueOf(last), id: idOf(last) }) : null,
  };
}
