import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import '@/shared/i18n/index.js';

expect.extend(axeMatchers);
configure({ asyncUtilTimeout: 10000 });

// jsdom has no ResizeObserver (Recharts needs one).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());
