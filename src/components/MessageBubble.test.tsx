// Knowledge sources under assistant answers (POST /chat `sources`, contract §4.2).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import '../i18n';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types';

const aiMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'ai-1',
  sender: 'ai',
  timestamp: new Date('2026-10-16T10:00:00Z'),
  text: 'Drain the standing water within two days.',
  ...overrides,
});

describe('MessageBubble sources', () => {
  it('lists each grounding document once under an assistant answer', () => {
    render(
      <MessageBubble
        message={aiMessage({
          sources: [
            { filename: 'paddy_flood_guide.pdf' },
            { filename: 'paddy_flood_guide.pdf' },
            { filename: 'tnau_fertiliser.txt' },
          ],
        })}
      />
    );
    const sources = screen.getByTestId('chat-sources');
    expect(sources).toHaveTextContent('Sources: paddy_flood_guide.pdf, tnau_fertiliser.txt');
  });

  it('renders nothing when the answer had no sources', () => {
    render(<MessageBubble message={aiMessage({ sources: [] })} />);
    expect(screen.queryByTestId('chat-sources')).not.toBeInTheDocument();
  });

  it('never shows sources on the farmer\'s own message', () => {
    render(<MessageBubble message={aiMessage({ sender: 'user', sources: [{ filename: 'x.pdf' }] })} />);
    expect(screen.queryByTestId('chat-sources')).not.toBeInTheDocument();
  });
});
