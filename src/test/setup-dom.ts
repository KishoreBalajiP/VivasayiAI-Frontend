// Setup for the jsdom component-test project.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not enable globals here, so Testing Library's automatic cleanup is not registered.
// Without this the previous test's DOM stays mounted and every query matches several nodes.
afterEach(() => {
  cleanup();
});

// jsdom has no layout, so `scrollIntoView` (chat auto-scroll) and the Web Speech API that
// VoiceRecorder's hook instantiates on mount are missing. Without these stubs any test that
// renders ChatInterface throws on mount.
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => {}, writable: true });
Object.defineProperty(window, 'SpeechRecognition', { value: function SpeechRecognition() {}, writable: true });
Object.defineProperty(window, 'webkitSpeechRecognition', { value: function SpeechRecognition() {}, writable: true });

