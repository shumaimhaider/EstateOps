/**
 * Domain-specific errors. The domain and application layers throw these; the interfaces layer
 * maps them to HTTP status codes in one place (platform/http/errorMapper.js).
 */
export class DomainError extends Error {
  /** @param {{ kind: string, code: string, message: string, details?: Array<{field: string, message: string}> }} p */
  constructor({ kind, code, message, details = [] }) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  constructor(message, details = []) {
    super({ kind: 'validation', code: 'VALIDATION_ERROR', message, details });
  }
}

/** One field problem, the most common validation failure. */
export const fieldError = (field, message, summary = 'The request is not valid') =>
  new ValidationError(summary, [{ field, message }]);

export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super({ kind: 'not_found', code: 'NOT_FOUND', message });
  }
}

export class ConflictError extends DomainError {
  constructor(code, message) {
    super({ kind: 'conflict', code, message });
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(message) {
    super({ kind: 'conflict', code: 'INVALID_TRANSITION', message });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Your role does not allow this action') {
    super({ kind: 'forbidden', code: 'FORBIDDEN', message });
  }
}

export class RateLimitedError extends DomainError {
  constructor(message = 'Too many attempts. Try again later.') {
    super({ kind: 'rate_limited', code: 'TOO_MANY_ATTEMPTS', message });
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(code = 'UNAUTHENTICATED', message = 'Sign in to continue') {
    super({ kind: 'unauthenticated', code, message });
  }
}
