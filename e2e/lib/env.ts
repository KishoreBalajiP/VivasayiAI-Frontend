// Fixed addresses of the hermetic e2e run (design-testing §2.2, ADR-024). Shared by
// playwright.config.ts, the fixtures and the global teardown, so a port lives in one place.
//
// Everything is loopback. The backend harness (VivasayiAI/scripts/e2e/hermeticBackend.js) serves the
// product API on API_PORT and the e2e control server (tiles, geocoder stubs, /__e2e/*) on
// CONTROL_PORT; Vite serves this app on VITE_PORT. The harness only allows CORS from the Vite origin.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST = '127.0.0.1';
export const API_PORT = 18080;
export const CONTROL_PORT = 18081;
export const VITE_PORT = 15173;

export const API_URL = `http://${HOST}:${API_PORT}`;
export const CONTROL_URL = `http://${HOST}:${CONTROL_PORT}`;
export const APP_URL = `http://${HOST}:${VITE_PORT}`;

// A second harness whose verification worker is a SEPARATE PROCESS (`--worker=process`, the D7
// deployment shape), used only by E2E-11 (worker crash): its own throw-away MongoDB, API and control
// server. The browser's API calls are routed to it by that spec (the Vite build targets API_URL).
export const PROCESS_API_PORT = 18082;
export const PROCESS_CONTROL_PORT = 18083;
export const PROCESS_API_URL = `http://${HOST}:${PROCESS_API_PORT}`;
export const PROCESS_CONTROL_URL = `http://${HOST}:${PROCESS_CONTROL_PORT}`;

/** The Vite environment of an e2e run. Mirrored (for documentation) by the committed .env.e2e. */
export const VITE_E2E_ENV: Readonly<Record<string, string>> = Object.freeze({
  VITE_API_URL: API_URL,
  VITE_MAP_TILE_URL: `${CONTROL_URL}/tiles/{z}/{x}/{y}.png`,
  VITE_GEOCODER_URL: `${CONTROL_URL}/geocode/search`,
  VITE_COGNITO_DOMAIN: 'cognito.e2e.invalid',
  VITE_COGNITO_CLIENT_ID: 'e2e',
  VITE_COGNITO_REDIRECT_URI: APP_URL,
});

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The backend repository: VIVASAYI_BACKEND_DIR, or the sibling checkout ../VivasayiAI. */
export const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, process.env.VIVASAYI_BACKEND_DIR || '../VivasayiAI');

/** Where the harness writes {apiUrl, controlUrl, controlToken, ...} (mode 0600; deleted on a clean exit). */
export const HARNESS_OUT = path.join(FRONTEND_ROOT, 'test-results', 'e2e', 'harness.json');
export const PROCESS_HARNESS_OUT = path.join(FRONTEND_ROOT, 'test-results', 'e2e', 'harness-process.json');

/** The Playwright JSON report (E2E_JSON_OUT, e.g. set by the backend's `npm run acceptance`). */
export const JSON_REPORT = process.env.E2E_JSON_OUT
  ? path.resolve(FRONTEND_ROOT, process.env.E2E_JSON_OUT)
  : path.join(FRONTEND_ROOT, 'test-results', 'e2e', 'results.json');

/**
 * The backend harness's final network-violation list, written by the global teardown for the
 * acceptance report (`<raw dir>/network-violations.json`). With E2E_JSON_OUT set it lands next to the
 * JSON report (the acceptance runner's raw directory); otherwise in test-results/raw/.
 */
export const NETWORK_VIOLATIONS_OUT = process.env.E2E_NETWORK_VIOLATIONS_OUT
  ? path.resolve(FRONTEND_ROOT, process.env.E2E_NETWORK_VIOLATIONS_OUT)
  : process.env.E2E_JSON_OUT
    ? path.join(path.dirname(JSON_REPORT), 'network-violations.json')
    : path.join(FRONTEND_ROOT, 'test-results', 'raw', 'network-violations.json');

/**
 * Loopback only. Anything else a page tries to reach is aborted by the fixtures and fails the test.
 * (blob: and data: URLs never leave the browser and are not network requests.)
 */
export const LOOPBACK_URL = /^(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
export const isNetworkUrl = (url: string): boolean => /^(?:https?|wss?):/i.test(url);
export const isExternalUrl = (url: string): boolean => isNetworkUrl(url) && !LOOPBACK_URL.test(url);
