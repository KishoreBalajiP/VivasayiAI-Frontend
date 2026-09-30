// Setup for the jsdom component-test project.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not enable globals here, so Testing Library's automatic cleanup is not registered.
// Without this the previous test's DOM stays mounted and every query matches several nodes.
afterEach(() => {
  cleanup();
});
