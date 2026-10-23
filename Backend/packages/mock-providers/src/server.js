import { createServer } from 'node:http';

/** Starts an express app on a free (or given) port. `close()` stops it. */
export function listen(app, port = 0, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.once('error', reject);
    server.listen(port, host, () => {
      const { port: bound } = server.address();
      resolve({
        server,
        port: bound,
        url: `http://${host}:${bound}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}
