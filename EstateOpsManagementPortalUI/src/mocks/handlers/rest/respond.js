import { HttpResponse } from 'msw';
import { runOperation, toInternalError } from '../operation.js';

export const restPage = ({ items, nextCursor }) => ({ data: items, next_cursor: nextCursor });

/** Runs an operation and serialises it as REST JSON, or as { code, message, details }. */
export async function respond(request, op, { status = 200 } = {}) {
  try {
    const body = await runOperation(request, op);
    return HttpResponse.json(body, { status });
  } catch (raw) {
    const error = toInternalError(raw);
    return HttpResponse.json(
      { code: error.code, message: error.message, details: error.details },
      { status: error.status },
    );
  }
}
