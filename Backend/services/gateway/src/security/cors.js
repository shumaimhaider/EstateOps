const ALLOWED_HEADERS = 'Authorization, Content-Type, Idempotency-Key, X-Request-Id';
const EXPOSED_HEADERS = 'X-Request-Id, Idempotent-Replay, Retry-After, Content-Disposition';

/**
 * CORS for the browser apps. Only listed origins are answered; a request from any other origin gets
 * no CORS headers and the browser blocks it. Tokens travel in the Authorization header, never in
 * cookies, so credentials are not allowed.
 */
export const cors = (allowedOrigins) => (req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    });
    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '600',
      });
      return res.status(204).end();
    }
  } else if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
};
