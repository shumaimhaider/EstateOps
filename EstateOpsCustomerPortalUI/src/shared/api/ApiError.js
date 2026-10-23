/**
 * One error shape for both transports. `fieldErrors` is keyed by the wire field
 * name until a feature mapper renames it to form field names.
 */
export class ApiError extends Error {
  /** @param {{ code: string, message: string, status?: number | null, fieldErrors?: Record<string,string> }} p */
  constructor({ code, message, status = null, fieldErrors = {} }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Thrown when a response does not match its DTO schema (backend drift). */
export class ContractError extends Error {
  constructor({ entity, issues }) {
    super(`Response for "${entity}" does not match the API contract`);
    this.name = 'ContractError';
    this.code = 'CONTRACT_ERROR';
    this.status = null;
    this.fieldErrors = {};
    this.entity = entity;
    this.issues = issues;
  }
}

function toFieldErrors(details) {
  const out = {};
  for (const d of Array.isArray(details) ? details : []) {
    if (d?.field && !out[d.field]) out[d.field] = d.message;
  }
  return out;
}

/** REST body: { code, message, details: [{ field, message }] } */
export function fromRestError(status, body) {
  return new ApiError({
    code: body?.code ?? `HTTP_${status}`,
    message: body?.message ?? `Request failed with status ${status}`,
    status,
    fieldErrors: toFieldErrors(body?.details),
  });
}

/** GraphQL errors[]: extensions carry { code, status, details }. */
export function fromGraphQLErrors(errors, httpStatus = null) {
  const first = errors?.[0] ?? {};
  const ext = first.extensions ?? {};
  return new ApiError({
    code: ext.code ?? 'GRAPHQL_ERROR',
    message: first.message ?? 'GraphQL request failed',
    status: ext.status ?? httpStatus,
    fieldErrors: toFieldErrors(ext.details),
  });
}

export function fromNetworkError(cause) {
  const aborted = cause?.name === 'AbortError';
  return new ApiError({
    code: aborted ? 'ABORTED' : 'NETWORK_ERROR',
    message: aborted ? 'Request cancelled' : 'Network error. Check your connection and retry.',
    status: null,
  });
}
