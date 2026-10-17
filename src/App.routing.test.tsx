import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import './i18n';
import { useHashRoute } from './routing/useHashRoute';

// App shell routing (plan B2) and farm-first header (B6). Heavy sections are replaced by stubs:
// what is under test is which section App renders for a URL, and that the URL follows the nav.

const authState = {
  user: { email: 'farmer@example.test', name: 'Murugan' },
  language: 'en' as const,
  isLoading: false,
  setLanguage: vi.fn(),
  logout: vi.fn(),
  isAdmin: false,
};
vi.mock('./context/AuthContext', () => ({ useAuth: () => authState, USER_STORAGE_KEY: 'vivasayi.auth:user' }));

const getProfile = vi.fn();
vi.mock('./api', () => ({
  getProfile: () => getProfile(),
  deleteChatSession: vi.fn(),
  getWeather: vi.fn().mockResolvedValue({ district: 'Chennai', current: null, forecast: [], source: 'test', cached: false, ageSeconds: 0 }),
}));

vi.mock('./components/ChatInterface', () => ({ ChatInterface: () => <div data-testid="view-chat" /> }));
vi.mock('./components/ChatSidebar', () => ({ default: () => null }));
vi.mock('./components/AdminReviewPage', () => ({ AdminReviewPage: () => <div data-testid="view-admin" /> }));
vi.mock('./components/ProfileOnboarding', () => ({ ProfileOnboarding: () => null }));
vi.mock('./components/FarmProfileEditor', () => ({ FarmProfileEditor: () => null }));
// Closing Manage Parcels reloads the profile (App.handleManageParcelsClose); the stub exposes it.
vi.mock('./components/ManageParcels', () => ({
  ManageParcels: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      Close parcels stub
    </button>
  ),
}));
// The claims stub reads the route the way the real ClaimsPage derives its subview, so these tests
// prove App's half of RT-6. The real ClaimsPage half (#/claims/c_1 → that claim's tracker; opening a
// claim / finishing the wizard updates the hash) is in src/App.claimsRoute.test.tsx, which renders
// App with the real ClaimsPage.
vi.mock('./components/ClaimsPage', () => ({
  ClaimsPage: () => {
    const { route } = useHashRoute();
    return (
      <div data-testid="view-claims">
        {route.section === 'claims' ? `${route.view}${route.view === 'detail' ? `:${route.claimId}` : ''}` : ''}
      </div>
    );
  },
}));

import App from './App';
import { ApiClientError } from './api/client';

const getCurrentPosition = vi.fn();

beforeEach(() => {
  authState.isAdmin = false;
  getProfile.mockReset();
  getProfile.mockResolvedValue({ district: 'Chennai', crops: ['paddy'], acres: 2 });
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  window.history.replaceState(null, '', '/');
});

const nav = () => screen.getByRole('navigation', { name: 'Main navigation' });

describe('App routing', () => {
  it('RT-6: opening #/claims/c_1 renders the claims section with the claim route available', async () => {
    window.history.replaceState(null, '', '/#/claims/c_1');
    render(<App />);
    expect(await screen.findByTestId('view-claims')).toHaveTextContent('detail:c_1');
    expect(within(nav()).getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('view-chat')).not.toBeInTheDocument();
  });

  it('RT-6: no hash renders chat (the default) without rewriting the URL', async () => {
    render(<App />);
    expect(await screen.findByTestId('view-chat')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('RT-7: the Navbar pushes #/claims, and Back returns to chat (RT-4)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('view-chat');

    await user.click(within(nav()).getByRole('button', { name: 'Claims' }));
    expect(window.location.hash).toBe('#/claims');
    expect(await screen.findByTestId('view-claims')).toHaveTextContent('list');

    act(() => window.history.back());
    expect(await screen.findByTestId('view-chat')).toBeInTheDocument();

    act(() => window.history.forward());
    expect(await screen.findByTestId('view-claims')).toBeInTheDocument();
  });

  it('RT-8: an unknown hash shows chat and is replaced by #/chat without a new history entry', async () => {
    window.history.replaceState(null, '', '/#/does-not-exist');
    const length = window.history.length;
    render(<App />);
    expect(await screen.findByTestId('view-chat')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/chat'));
    expect(window.history.length).toBe(length);
  });

  it('RT-8: #/admin is render-gated — a farmer sees the denied state, an admin the review page', async () => {
    window.history.replaceState(null, '', '/#/admin');
    const { unmount } = render(<App />);
    expect(await screen.findByText('Administrator access only.')).toBeInTheDocument();
    expect(screen.queryByTestId('view-admin')).not.toBeInTheDocument();
    unmount();

    authState.isAdmin = true;
    render(<App />);
    expect(await screen.findByTestId('view-admin')).toBeInTheDocument();
  });
});

describe('App farm-first location', () => {
  it('LOC-10: the signed-in shell never requests geolocation on mount; the header shows the farm district', async () => {
    render(<App />);
    expect(await screen.findByText('Farm: Chennai')).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByRole('banner')).not.toHaveTextContent(/Outside Tamil Nadu/i);
  });
});

// The profile is reloaded after Manage Parcels closes. While that reload runs (status 'loading')
// or after it fails ('error'), the district already loaded is still known and must stay on screen.
describe('App profile reloads keep a known farm district', () => {
  const reloadProfileVia = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'farmer@example.test' }));
    await user.click(screen.getByRole('button', { name: 'Manage Parcels' }));
    await user.click(screen.getByRole('button', { name: 'Close parcels stub' }));
  };

  it('LOC-14: a known district stays in the header and weather strip during a reload and after it fails', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByTestId('header-farm-chip')).toHaveTextContent('Farm: Chennai');

    let failReload: (err: Error) => void = () => {};
    getProfile.mockReturnValueOnce(new Promise((_, reject) => (failReload = reject)));
    await reloadProfileVia(user);
    expect(getProfile).toHaveBeenCalledTimes(2);

    // Reload in flight: chip, weather source and the profile menu are unchanged.
    expect(screen.getByTestId('header-farm-chip')).toHaveTextContent('Farm: Chennai');
    expect(screen.getByText('Weather for your farm district: Chennai')).toBeInTheDocument();
    expect(screen.queryByText('Set farm district')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'farmer@example.test' }));
    expect(screen.getByRole('button', { name: 'Farm Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up farm profile' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close menu' }));

    // Reload failed: the retry bar appears, and the district is still shown.
    await act(async () => failReload(new Error('network down')));
    expect(await screen.findByText('Could not load your farm profile.')).toBeInTheDocument();
    expect(screen.getByTestId('header-farm-chip')).toHaveTextContent('Farm: Chennai');
    expect(screen.getByText('Weather for your farm district: Chennai')).toBeInTheDocument();
  });

  it('LOC-14: with no district known yet, loading and a failed load hide the chip rather than invite "Set farm district"', async () => {
    let failLoad: (err: Error) => void = () => {};
    getProfile.mockReturnValueOnce(new Promise((_, reject) => (failLoad = reject)));
    render(<App />);
    await screen.findByTestId('view-chat');
    expect(screen.queryByTestId('header-farm-chip')).not.toBeInTheDocument();

    await act(async () => failLoad(new Error('network down')));
    expect(await screen.findByText('Could not load your farm profile.')).toBeInTheDocument();
    expect(screen.queryByTestId('header-farm-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('Set farm district')).not.toBeInTheDocument();
  });

  it('LOC-14: a reload that finds the profile deleted (404) drops the old district', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByTestId('header-farm-chip')).toHaveTextContent('Farm: Chennai');

    getProfile.mockRejectedValueOnce(new ApiClientError(404, 'not found'));
    await reloadProfileVia(user);
    await waitFor(() => expect(screen.getByTestId('header-farm-chip')).toHaveTextContent('Set farm district'));
    expect(screen.getByRole('banner')).not.toHaveTextContent('Chennai');
  });
});
