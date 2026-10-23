import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import '@/shared/i18n/index.js';
import { tokenStore } from '@/shared/api/authLink.js';

expect.extend(axeMatchers);
configure({ asyncUtilTimeout: 5000 });

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  tokenStore.clear();
  globalThis.localStorage?.clear();
  globalThis.sessionStorage?.clear();
  cleanup();
});
