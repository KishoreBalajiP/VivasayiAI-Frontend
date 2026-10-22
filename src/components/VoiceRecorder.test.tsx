// UX-17: the mic error must be announced and readable, never a raw Error object in the copy.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import '../i18n';
import i18n from '../i18n';
import VoiceRecorder from './VoiceRecorder';

const hookState = {
  error: null as unknown,
  isRecording: false,
  results: [] as unknown[],
  startSpeechToText: vi.fn(),
  stopSpeechToText: vi.fn(),
  setResults: vi.fn(),
};

vi.mock('react-hook-speech-to-text', () => ({
  default: () => hookState,
}));

beforeEach(() => {
  hookState.error = null;
  hookState.isRecording = false;
  hookState.results = [];
});

describe('VoiceRecorder (UX-17)', () => {
  it('announces a friendly, translated microphone error and never leaks the raw Error object', () => {
    hookState.error = new Error('SpeechRecognition: not-allowed (code 8)');
    render(<VoiceRecorder onResult={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('We could not reach your microphone');
    expect(alert).not.toHaveTextContent('SpeechRecognition');
    expect(alert).not.toHaveTextContent('not-allowed');
  });

  it('shows the translated body in Tamil when the language is Tamil', async () => {
    hookState.error = new Error('boom');
    render(<VoiceRecorder onResult={() => {}} />);
    await i18n.changeLanguage('ta');
    try {
      expect(await screen.findByRole('alert')).toHaveTextContent('மைக்ரோஃபோனை');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('exposes a 44px-or-larger touch target', () => {
    render(<VoiceRecorder onResult={() => {}} />);
    const button = screen.getByRole('button', { name: 'Speak' });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('w-11');
  });

  it('renders no alert when there is no error', () => {
    render(<VoiceRecorder onResult={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
