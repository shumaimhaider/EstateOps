import { ZodError } from 'zod';

/** Maps any thrown error to an HTTP status and the API error body. The one place this happens. */
const STATUS_BY_KIND = {
  validation: 422,
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  unauthenticated: 401,
  rate_limited: 429,
};

const zodDetails = (error) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));

export function toHttpError(error) {
  if (error?.kind && STATUS_BY_KIND[error.kind]) {
    return {
      status: STATUS_BY_KIND[error.kind],
      body: { code: error.code, message: error.message, details: error.details ?? [] },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'The request is not valid',
        details: zodDetails(error),
      },
    };
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    return {
      status: error.type === 'entity.too.large' ? 413 : 400,
      body: { code: 'BAD_REQUEST', message: 'The request body could not be read', details: [] },
    };
  }
  // Database constraint backstops (repositories translate the expected ones themselves)
  if (error?.code === '23505') {
    return {
      status: 409,
      body: { code: 'CONFLICT', message: 'That value already exists', details: [] },
    };
  }
  if (error?.code === '23503') {
    return {
      status: 409,
      body: { code: 'REFERENCED', message: 'Other records depend on this', details: [] },
    };
  }
  if (error?.code === '23514') {
    return {
      status: 422,
      body: { code: 'VALIDATION_ERROR', message: 'A value is out of range', details: [] },
    };
  }
  return {
    status: 500,
    body: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
  };
}

export const errorMiddleware = (logger) => (error, req, res, _next) => {
  const { status, body } = toHttpError(error);
  if (status >= 500)
    logger.error({ err: error, requestId: req.id, path: req.path }, 'request failed');
  res.status(status).json(body);
};
