import { defineConfig } from 'vitest/config';

/** Back-end end-to-end suite: real processes, real databases. Run with `npm run test:e2e`. */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.js'],
    environment: 'node',
    globalSetup: ['./e2e/globalSetup.js'],
    testTimeout: 90_000,
    hookTimeout: 180_000,
    // each file starts its own full stack on its own databases and ports
    fileParallelism: false,
  },
});
