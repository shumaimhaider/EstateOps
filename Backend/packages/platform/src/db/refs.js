import { ident, table } from './sql.js';

/**
 * Upserts a local snapshot (`*_ref` table) of data another service owns. Events can arrive late or
 * twice, so the row changes only if the event is at least as new as what is stored (`source_at`).
 *
 * @param columns  { column_name: value } including the key column
 * @returns true when the row was written, false when a newer snapshot was already there
 */
export async function upsertRef(manager, { schema, name, key, columns, sourceAt }) {
  const names = Object.keys(columns);
  const all = [...names, 'source_at'];
  const values = [...Object.values(columns), sourceAt];
  const t = table(schema, name);
  const updates = all.filter((c) => c !== key).map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
  const rows = await manager.query(
    `INSERT INTO ${t} (${all.map(ident).join(', ')}) VALUES (${all.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (${ident(key)}) DO UPDATE SET ${updates.join(', ')}, updated_at = now()
       WHERE ${t}.source_at <= EXCLUDED.source_at
     RETURNING ${ident(key)}`,
    values,
  );
  return rows.length === 1;
}
