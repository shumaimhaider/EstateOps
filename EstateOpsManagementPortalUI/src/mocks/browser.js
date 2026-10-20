import { setupWorker } from 'msw/browser';
import { getDb } from './db/db.js';
import { handlers } from './handlers/index.js';

export const worker = setupWorker(...handlers);

/** Started by the bootstrap (main.jsx) before rendering, in mock mode only. */
export async function startMockServer() {
  getDb(); // seed (or restore from localStorage) before the first request
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}
