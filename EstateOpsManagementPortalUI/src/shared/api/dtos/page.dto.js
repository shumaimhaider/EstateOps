import { z } from 'zod';

/**
 * Cursor pagination envelopes for both transports, normalised to one shape:
 * `{ items, nextCursor }`. The only place pagination field names appear.
 * @template T
 * @typedef {{ items: T[], nextCursor: string | null }} Page
 */
export function pageDtoSchema(itemSchema) {
  const rest = z
    .object({ data: z.array(itemSchema), next_cursor: z.string().nullable() })
    .transform((r) => ({ items: r.data, nextCursor: r.next_cursor }));

  const connection = z
    .object({
      edges: z.array(z.object({ cursor: z.string(), node: itemSchema })),
      pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }),
    })
    .transform((c) => ({
      items: c.edges.map((e) => e.node),
      nextCursor: c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null,
    }));

  return z.union([rest, connection]);
}

/** Query params / GraphQL variables for a page request. */
export function pageParamsToApi({ cursor, limit }) {
  return { cursor: cursor ?? undefined, limit };
}
