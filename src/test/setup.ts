// Shared Vitest setup for the node-environment unit tests.
//
// `config.ts` reads window.location.origin at module/import time, so tests that do NOT mock
// ../config still need a window to import the api layer cleanly.
//
// The shim is conditional on purpose: under a jsdom environment a real `document` already
// exists, and replacing `window` there would blank the DOM that component tests rely on. It was
// previously applied unconditionally, which made every component test impossible to write.
const needsWindowShim = typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined';

if (needsWindowShim) {
  globalThis.window = {
    location: { origin: 'https://app.test.local' },
  } as unknown as Window & typeof globalThis;
}

// No real networking ever happens from this file — every test that touches fetch stubs
// globalThis.fetch itself.
