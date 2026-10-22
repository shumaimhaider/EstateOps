import http from 'node:http';
import https from 'node:https';

/** Headers that must never come from a client: they would let a caller pose as another service. */
const STRIPPED = [
  'x-internal-token',
  'x-bootstrap-token',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
];
const error = (res, status, code, message) => {
  if (res.headersSent) return res.destroy();
  res.status(status).json({ code, message, details: [] });
};

/**
 * Streams a request to an upstream service and its answer back, without reading either body, so
 * uploads and downloads of any size pass through with constant memory. Upstream down is a 502,
 * too slow a 504.
 */
export function forward(req, res, { target, timeoutMs = 30_000, logger }) {
  const url = new URL(req.originalUrl, target);
  const headers = {
    ...req.headers,
    host: url.host,
    'x-request-id': req.id,
    'x-forwarded-for': req.ip,
    'x-forwarded-proto': req.protocol,
  };
  for (const name of STRIPPED.filter((n) => !['x-forwarded-for', 'x-forwarded-proto'].includes(n)))
    delete headers[name];

  const transport = url.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    url,
    { method: req.method, headers, timeout: timeoutMs },
    (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    },
  );
  let timedOut = false;
  upstream.on('timeout', () => {
    timedOut = true;
    upstream.destroy(new Error('upstream timed out'));
  });
  upstream.on('error', (cause) => {
    logger?.warn({ err: cause, target: url.origin, requestId: req.id }, 'upstream failed');
    if (timedOut) error(res, 504, 'UPSTREAM_TIMEOUT', 'The service took too long to answer');
    else error(res, 502, 'UPSTREAM_UNAVAILABLE', 'The service is not available right now');
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
