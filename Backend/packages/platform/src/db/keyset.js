import { clampLimit, decodeCursor, encodeCursor } from '@estateops/kernel';

/**
 * Keyset (cursor) pagination for a TypeORM query builder. Never OFFSET: cost stays flat however
 * deep the page. Sort expressions must be NOT NULL (wrap nullable ones in COALESCE).
 *
 * @param qb          query builder with filters already applied
 * @param sort        { expr: 'SQL expression', dir: 'asc'|'desc', cast?: 'bigint'|'date'|'text'|'int' }
 * @param idExpr      the unique id column expression, the tiebreaker
 * @param cursor      opaque cursor from the previous page
 * @param valueOf     (row) => the sort value of a loaded row (for building the next cursor)
 * @param idOf        (row) => the id of a loaded row
 * @returns {{ rows, nextCursor }} rows are the raw loaded entities, `limit` at most
 */
export async function keysetPage({ qb, sort, idExpr, cursor, limit, valueOf, idOf, select }) {
  const size = clampLimit(limit);
  const after = decodeCursor(cursor);
  const op = sort.dir === 'desc' ? '<' : '>';
  const cast = sort.cast ?? 'text';

  if (after) {
    qb.andWhere(`(${sort.expr}, ${idExpr}) ${op} (CAST(:kv AS ${cast}), CAST(:kid AS uuid))`, {
      kv: after.v,
      kid: after.id,
    });
  }
  qb.orderBy(sort.expr, sort.dir === 'desc' ? 'DESC' : 'ASC').addOrderBy(
    idExpr,
    sort.dir === 'desc' ? 'DESC' : 'ASC',
  );
  if (select) qb.select(select);
  const rows = await qb.take(size + 1).getMany();
  const more = rows.length > size;
  const page = more ? rows.slice(0, size) : rows;
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: more && last ? encodeCursor({ v: valueOf(last), id: idOf(last) }) : null,
  };
}
