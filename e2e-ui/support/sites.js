import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function forward(req, res, target, stripPrefix = '') {
  const url = new URL(req.url.replace(stripPrefix, ''), target);
  const upstream = httpRequest(url, { method: req.method, headers: { ...req.headers, host: url.host } }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502).end('bad gateway');
  });
  req.pipe(upstream);
}

/** A built single-page app served like nginx does: assets as files, unknown paths open index.html, /api to the gateway. */
export function serveSite({ dist, gatewayUrl, stripeUrl, port = 0 }) {
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api/')) return forward(req, res, gatewayUrl);
    if (req.url.startsWith('/stripe/')) return forward(req, res, stripeUrl, '/stripe');
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) }),
    ),
  );
}
