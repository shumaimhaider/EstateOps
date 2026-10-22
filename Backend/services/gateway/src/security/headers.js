/** Safe defaults on every response: no sniffing, no framing, no caching of API data, HSTS when behind TLS. */
export const securityHeaders =
  ({ hsts = false } = {}) =>
  (_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    if (hsts) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
