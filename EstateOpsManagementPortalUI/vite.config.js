import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // `npm run dev` talks to the real gateway (start the stack first: `make up`)
  server: {
    proxy: {
      '/api': process.env.GATEWAY_URL ?? 'http://localhost:8080',
      '/stripe': {
        target: process.env.STRIPE_STAND_IN_URL ?? 'http://localhost:12111',
        rewrite: (p) => p.replace(/^\/stripe/, ''),
      },
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 20000,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    env: {
      VITE_API_TRANSPORT: 'rest',
      VITE_API_BASE_URL: 'http://localhost/api/v1',
      VITE_GRAPHQL_URL: 'http://localhost/graphql',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'src/main.jsx', '**/*.test.{js,jsx}'],
    },
  },
});
