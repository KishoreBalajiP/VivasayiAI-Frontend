import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import './i18n';

// The farm-profile onboarding overlay and the admin review workspace (found by e2e E2E-19a/b): a
// reviewer signed in without a farm profile opened #/admin and the onboarding modal covered the
// queue, intercepting every click until it was dismissed. Onboarding is for farmers; it must never
// sit over the admin section, and it still appears everywhere else when the profile is missing.

const authState = {
  user: { email: 'reviewer@example.test', name: 'Reviewer' },
  language: 'en' as const,
  isLoading: false,
  setLanguage: vi.fn(),
  logout: vi.fn(),
  isAdmin: true,
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
vi.mock('./components/ClaimsPage', () => ({ ClaimsPage: () => <div data-testid="view-claims" /> }));
vi.mock('./components/ProfileOnboarding', () => ({ ProfileOnboarding: () => <div data-testid="profile-onboarding" /> }));
vi.mock('./components/FarmProfileEditor', () => ({ FarmProfileEditor: () => null }));
vi.mock('./components/ManageParcels', () => ({ ManageParcels: () => null }));

import App from './App';
import { ApiClientError } from './api/client';

beforeEach(() => {
  authState.isAdmin = true;
  getProfile.mockReset();
  // GET /profile answers 404: this user has no farm profile.
  getProfile.mockRejectedValue(new ApiClientError(404, 'notFound'));
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('farm-profile onboarding and the admin section', () => {
  it('RT-9: an admin without a farm profile opens #/admin and the onboarding overlay does not cover the review workspace', async () => {
    window.history.replaceState(null, '', '/#/admin');
    render(<App />);
    expect(await screen.findByTestId('view-admin')).toBeInTheDocument();
    await waitFor(() => expect(getProfile).toHaveBeenCalled());
    // Let the 404 settle into profileStatus 'missing' before checking the overlay stays away.
    await waitFor(() => expect(screen.queryByTestId('profile-onboarding')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('profile-onboarding')).not.toBeInTheDocument();
    expect(screen.getByTestId('view-admin')).toBeInTheDocument();
  });

  it('RT-10: without a farm profile the onboarding still appears outside the admin section (claims, and after leaving #/admin)', async () => {
    authState.isAdmin = false;
    window.history.replaceState(null, '', '/#/claims');
    const { unmount } = render(<App />);
    expect(await screen.findByTestId('profile-onboarding')).toBeInTheDocument();
    unmount();

    authState.isAdmin = true;
    window.history.replaceState(null, '', '/#/admin');
    render(<App />);
    expect(await screen.findByTestId('view-admin')).toBeInTheDocument();
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('profile-onboarding')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    expect(await screen.findByTestId('profile-onboarding')).toBeInTheDocument();
  });
});
