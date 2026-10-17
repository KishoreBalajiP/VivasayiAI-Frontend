// Knowledge sources under assistant answers (POST /chat `sources`, contract §4.2).
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';
import i18n from '../i18n';
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

describe('MessageBubble design tokens and translated labels', () => {
  const userMessage = (): Message => ({
    id: 'u-1',
    sender: 'user',
    timestamp: new Date('2026-10-16T10:00:00Z'),
    text: 'My paddy leaves are yellow.',
  });

  it("UI-15: the farmer's bubble is the flat brand-700 token, not the copied gradient", () => {
    render(<MessageBubble message={userMessage()} />);
    const bubble = screen.getByText('My paddy leaves are yellow.').parentElement!;
    expect(bubble).toHaveClass('bg-brand-700', 'text-white');
    expect(bubble.className).not.toMatch(/gradient|from-emerald-600|to-green-700/);
  });

  it('UI-15: the message menu, its close-menu backdrop and its icons are labelled through i18n (English and Tamil)', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    render(<MessageBubble message={userMessage()} onRequestDelete={onRequestDelete} />);

    const menuButton = screen.getByRole('button', { name: 'Message options' });
    expect(menuButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();

    await i18n.changeLanguage('ta');
    try {
      expect(await screen.findByRole('button', { name: 'பட்டியலை மூடு' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'செய்தி விருப்பங்கள்' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }

    await user.click(screen.getByRole('button', { name: 'Delete message' }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  });
});
