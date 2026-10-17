// Playwright e2e configuration (plan Part C, design-testing §2.2, ADR-024). See e2e/README.md.
//
// Hermetic: three web servers are started fresh for every run (never reused, so a dev server wired to
// a real .env can never be picked up):
//   1. the backend harness (VivasayiAI/scripts/e2e/hermeticBackend.js): the real API + an inline worker
//      against a throw-away MongoDB, with a fake Gemini and mock storage / land records / weather /
//      satellite, and a network guard that blocks any non-loopback connection;
//   2. a second harness with `--worker=process` (the worker is a separate process), for E2E-11 only;
//   3. Vite in `--mode e2e`, pointed at harness 1 (tiles and geocoder at its control server).
// The fixtures (e2e/fixtures.ts) abort every non-loopback browser request and fail the test on any.
//
// workers: 1 is mandatory: the fake-Gemini scenario is process-wide in the harness.

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  APP_URL,
  BACKEND_ROOT,
  CONTROL_PORT,
  CONTROL_URL,
  FRONTEND_ROOT,
  HARNESS_OUT,
  HOST,
  JSON_REPORT,
  PROCESS_API_PORT,
  PROCESS_CONTROL_PORT,
  PROCESS_CONTROL_URL,
  PROCESS_HARNESS_OUT,
  VITE_E2E_ENV,
  VITE_PORT,
} from './e2e/lib/env';

// One control token per run. Set here (in the runner) before the web servers and the test workers are
// spawned, so the harness and every worker share it; the workers re-evaluate this file and keep it.
if (!process.env.E2E_CONTROL_TOKEN || process.env.E2E_CONTROL_TOKEN.length < 16) {
  process.env.E2E_CONTROL_TOKEN = `e2e-${randomBytes(24).toString('hex')}`;
}

const quote = (value: string) => JSON.stringify(value);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // Artifacts (screenshots, traces, videos) per test; reports and the harness out file sit beside it.
  outputDir: path.join(FRONTEND_ROOT, 'test-results', 'e2e', 'artifacts'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: true,
  reporter: [
    ['list'],
    ['json', { outputFile: JSON_REPORT }],
    ['html', { open: 'never', outputFolder: path.join(FRONTEND_ROOT, 'test-results', 'e2e', 'html') }],
  ],
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: APP_URL,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    timezoneId: 'Asia/Kolkata',
    serviceWorkers: 'block',
    // No geolocation permission: the app never asks for location on its own (autoRequest=false).
    permissions: [],
    launchOptions: {
      // MapLibre needs WebGL; SwiftShader gives it one without a GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      name: 'harness',
      command: [
        'node',
        quote(path.join(BACKEND_ROOT, 'scripts', 'e2e', 'hermeticBackend.js')),
        `--port ${API_PORT}`,
        `--control-port ${CONTROL_PORT}`,
        '--worker=inline',
        `--out ${quote(HARNESS_OUT)}`,
      ].join(' '),
      cwd: BACKEND_ROOT,
      url: `${CONTROL_URL}/__e2e/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_CONTROL_TOKEN: process.env.E2E_CONTROL_TOKEN },
      stdout: 'ignore',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
    },
    {
      // E2E-11 only: the same harness with the worker as a separate process it can SIGKILL and restart.
      name: 'harness-process',
      command: [
        'node',
        quote(path.join(BACKEND_ROOT, 'scripts', 'e2e', 'hermeticBackend.js')),
        `--port ${PROCESS_API_PORT}`,
        `--control-port ${PROCESS_CONTROL_PORT}`,
        '--worker=process',
        `--out ${quote(PROCESS_HARNESS_OUT)}`,
      ].join(' '),
      cwd: BACKEND_ROOT,
      url: `${PROCESS_CONTROL_URL}/__e2e/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_CONTROL_TOKEN: process.env.E2E_CONTROL_TOKEN },
      stdout: 'ignore',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
    },
    {
      name: 'vite',
      command: `npx vite --mode e2e --host ${HOST} --port ${VITE_PORT} --strictPort`,
      cwd: FRONTEND_ROOT,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      // The process environment beats every .env* file in Vite: the e2e build always targets the harness.
      env: { ...VITE_E2E_ENV },
      stdout: 'ignore',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
});
