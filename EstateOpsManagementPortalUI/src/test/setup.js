import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import '@/shared/i18n/index.js';
import { tokenStore } from '@/shared/api/authLink.js';
import { getDb, resetDb } from '@/mocks/db/db.js';
import { setPersistence } from '@/mocks/db/persistence.js';
import { mockToken } from '@/mocks/engine/context.js';
import { server } from '@/mocks/server.js';

expect.extend(axeMatchers);
configure({ asyncUtilTimeout: 5000 });

// jsdom has no ResizeObserver (Recharts needs one).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no layout engine and no <dialog> modal support; keep behaviour deterministic.
beforeAll(() => {
  setPersistence(false);
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  resetDb();
  getDb().settings.latencyMs = [0, 0];
  tokenStore.set(mockToken('pk', 'owner'));
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
