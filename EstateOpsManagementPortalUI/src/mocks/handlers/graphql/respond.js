import { HttpResponse } from 'msw';
import { runOperation, toInternalError } from '../operation.js';

/** Relay-style connection built from the engine's page result. */
export const toConnection = ({ items, cursors, nextCursor }) => ({
  edges: items.map((node, i) => ({ cursor: cursors[i], node })),
  pageInfo: {
    endCursor: nextCursor ?? cursors.at(-1) ?? null,
    hasNextPage: nextCursor !== null,
  },
});

/** Flattens GraphQL list variables ({ filter, sort, cursor, limit }) into the engine's params. */
export const listArgs = ({ filter, sort, cursor, limit }) => ({ ...filter, sort, cursor, limit });

/** Runs an operation and serialises it as a GraphQL response ({ data } or { errors }). */
export async function respondGraphql(request, op) {
  try {
    return HttpResponse.json({ data: await runOperation(request, op) });
  } catch (raw) {
    const error = toInternalError(raw);
    return HttpResponse.json(
      {
        data: null,
        errors: [
          {
            message: error.message,
            extensions: { code: error.code, status: error.status, details: error.details },
          },
        ],
      },
      { status: error.status === 401 ? 401 : 200 },
    );
  }
}
