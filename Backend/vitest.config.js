import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.js', 'services/*/test/**/*.test.js'],
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: { provider: 'v8', include: ['packages/*/src/**', 'services/*/src/**'] },
  },
});
