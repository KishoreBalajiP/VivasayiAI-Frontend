import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import i18n from '../i18n';
import { createMemoryStorage } from '../test/memoryStorage';

const sendChatMessage = vi.fn();
const getChatSession = vi.fn();
const runImageTurn = vi.fn();
const listParcels = vi.fn();

vi.mock('../api', () => ({
  sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
  getChatSession: (...args: unknown[]) => getChatSession(...args),
  runImageTurn: (...args: unknown[]) => runImageTurn(...args),
  listParcels: () => listParcels(),
}));

const useAuth = vi.fn();
const useLocation = vi.fn();

vi.mock('../context/AuthContext', () => ({ useAuth: () => useAuth() }));
vi.mock('../context/LocationContext', () => ({ useLocation: () => useLocation() }));
vi.mock('./VoiceRecorder', () => ({ default: () => <button aria-label='Speak'>Speak</button> }));

import { ChatInterface } from './ChatInterface';

const authValue = (language: 'en' | 'ta' = 'en') => ({
  user: { id: 'u1', email: 'farmer@example.com', name: 'Farmer' },
  token: 't',
  loading: false,
  language,
  login: vi.fn(),
  logout: vi.fn(),
  setLanguage: vi.fn(),
});

const locationValue = () => ({
  status: 'idle',
  district: null,
  coords: null,
  details: null,
  errorKey: null,
  precision: null,
  stateName: null,
  requestLocation: vi.fn().mockResolvedValue(undefined),
});

const renderChat = () => render(<ChatInterface activeChatId={null} setActiveChatId={vi.fn()} />);

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  sendChatMessage.mockReset();
  getChatSession.mockReset();
  runImageTurn.mockReset();
  listParcels.mockReset();
  listParcels.mockResolvedValue([]);
  useAuth.mockReset();
  useAuth.mockReturnValue(authValue());
  useLocation.mockReset();
  useLocation.mockReturnValue(locationValue());
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatInterface UX-05', () => {
  it('centers welcome block in the conversation column and renders the four suggestions', () => {
    renderChat();
    const welcome = screen.getByTestId('chat-welcome');
    expect(welcome).toHaveClass('justify-center', 'flex-1');
    expect(screen.getByTestId('chat-suggestions')).toBeInTheDocument();
    for (const label of [
      'What crops are suitable for this season?',
      'How to control pests in paddy fields?',
      'What fertilizer should I use for vegetables?',
      'How will the weather affect my crops?',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('suggestion clicks fill the composer (same keys, click-to-fill kept)', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole('button', { name: 'How will the weather affect my crops?' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      'How will the weather affect my crops?'
    );
  });
});

describe('ChatInterface UX-13', () => {
  const sendFailingTurn = async () => {
    const user = userEvent.setup();
    sendChatMessage.mockRejectedValue(new Error('fail'));
    renderChat();
    await user.type(screen.getByRole('textbox'), 'test');
    await user.click(screen.getByRole('button', { name: /^send$|^அனுப்பு$/i }));
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
  };

  it('renders the send-failure bubble as the serverError key in English', async () => {
    await sendFailingTurn();
    expect(await screen.findByText('Server error. Please try again.')).toBeInTheDocument();
    expect(await screen.findByText(i18n.t('serverError'))).toBeInTheDocument();
  });

  it('renders the same bubble in Tamil when the active language is ta', async () => {
    await i18n.changeLanguage('ta');
    useAuth.mockReturnValue(authValue('ta'));
    await sendFailingTurn();
    const expected = i18n.t('serverError');
    expect(expected).not.toBe('Server error. Please try again.');
    expect(await screen.findByText(expected)).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
