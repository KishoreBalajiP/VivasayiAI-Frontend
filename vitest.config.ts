import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two deterministic test environments:
//
//   unit  — node. Pure logic in src/utils and src/api. No browser needed.
//   dom   — jsdom. React component tests (*.test.tsx) that assert rendered behaviour.
//
// No test ever reaches a real backend: fetch is stubbed per test and S3/AI backends are never
// contacted. MapLibre needs WebGL, so `ParcelDrawMap` itself is exercised in a real browser
// (see PARCEL_MAP_AND_CLAIM_FLOW_FINAL_REPORT.md) rather than here.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['src/test/setup.ts'],
          // Vitest replaces every .css import with an empty string, even `?raw`. Let the global
          // stylesheet through (raw, unprocessed) so UI-9 can pin the focus-ring rules in it.
          css: { include: [/\/src\/index\.css(?:$|\?)/] },
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
