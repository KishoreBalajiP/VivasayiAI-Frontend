// Minimal browser-global shim for node-env unit tests. config.ts reads
// window.location.origin at module/import time; tests that do NOT mock ../config still
// need a window to import the api layer cleanly. No real networking ever happens — every
// test that touches fetch stubs globalThis.fetch.
globalThis.window = {
  location: { origin: 'https://app.test.local' },
} as unknown as Window & typeof globalThis;