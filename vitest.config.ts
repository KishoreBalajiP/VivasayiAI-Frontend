import { defineConfig } from 'vitest/config';

// Deterministic unit-test config: node environment (no browser/jsdom needed — tests only
// exercise pure logic in src/utils and src/api, never React rendering). No test ever reaches
// a real backend: fetch is stubbed per test and S3/AI backends are never contacted.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});