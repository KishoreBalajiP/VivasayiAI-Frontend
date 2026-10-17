import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import './i18n';
import { createMemoryStorage } from './test/memoryStorage';
import { progressFor } from './test/progressFixtures';
import type { LossClaim } from './types';

// RT-6 end to end inside the app shell (was an it.todo in App.routing.test.tsx, which stubs the
// claims section): App renders the REAL ClaimsPage, which derives list / wizard / tracker from the
// URL hash. Only the network layer and the heavy wizard are replaced.

const authState = {
  user: { email: 'farmer@example.test', name: 'Murugan' },
  language: 'en' as const,
  isLoading: false,
  setLanguage: vi.fn(),
  logout: vi.fn(),
  isAdmin: false,
};
vi.mock('./context/AuthContext', () => ({ useAuth: () => authState, USER_STORAGE_KEY: 'vivasayi.auth:user' }));

vi.mock('./api', () => ({
  getProfile: vi.fn().mockResolvedValue({ district: 'Chennai', crops: ['paddy'], acres: 2 }),
  deleteChatSession: vi.fn(),
  uploadImage: vi.fn(),
  getWeather: vi.fn().mockResolvedValue({ district: 'Chennai', current: null, forecast: [], source: 'test', cached: false, ageSeconds: 0 }),
}));

const api = vi.hoisted(() => ({
  listClaims: vi.fn(),
  getClaim: vi.fn(),
  getClaimProgress: vi.fn(),
  verifyClaimRequest: vi.fn(),
}));
vi.mock('./api/claims', () => ({
  ...api,
  getClaimVerification: vi.fn(),
  createClaim: vi.fn(),
  submitClaim: vi.fn(),
  submitClaimTracked: vi.fn(),
  withdrawClaim: vi.fn(),
  resubmitClaim: vi.fn(),
  uploadClaimEvidence: vi.fn(),
  attachOwnershipEvidence: vi.fn(),
  deleteEvidenceUpload: vi.fn(),
  getEvidenceUrl: vi.fn(),
  listParcels: vi.fn().mockResolvedValue([]),
  listOwnershipEvidence: vi.fn().mockResolvedValue({ claimId: 'c_1', evidence: [], summary: {} }),
  getOwnershipDocumentUrl: vi.fn(),
  uploadOwnershipDocument: vi.fn(),
  OWNERSHIP_DOCUMENT_ACCEPT: 'image/jpeg,image/png,image/webp',
  getAppeal: vi.fn().mockResolvedValue(null),
  submitAppeal: vi.fn(),
}));

vi.mock('./components/ChatInterface', () => ({ ChatInterface: () => <div data-testid="view-chat" /> }));
vi.mock('./components/ChatSidebar', () => ({ default: () => null }));
vi.mock('./components/AdminReviewPage', () => ({ AdminReviewPage: () => null }));
vi.mock('./components/ProfileOnboarding', () => ({ ProfileOnboarding: () => null }));
vi.mock('./components/FarmProfileEditor', () => ({ FarmProfileEditor: () => null }));
vi.mock('./components/ManageParcels', () => ({ ManageParcels: () => null }));
// The wizard has its own suite; here only its exit matters (it hands the saved claim back).
vi.mock('./components/ClaimWizard', () => ({
  ClaimWizard: ({ onDone }: { onDone: (claim: { id: string }) => void }) => (
    <button type="button" onClick={() => onDone({ id: 'c_9' })}>
      finish wizard
    </button>
  ),
}));

import App from './App';

const claimFor = (id: string): LossClaim =>
  ({
    id,
    parcelId: 'par_1',
    parcelSnapshot: { parcelId: 'par_1', name: 'North Field', crop: 'Rice', parcelAreaAcres: 1.25 },
    eventType: 'flood',
    eventDate: '2026-10-10T00:00:00.000Z',
    claimedGeometry: { type: 'Polygon', coordinates: [] },
    claimedAreaAcres: 1.1,
    evidence: [],
    state: 'submitted',
    submittedAt: '2026-10-16T09:00:00.000Z',
    processedAt: null,
    decidedAt: null,
    createdAt: '2026-10-16T08:50:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
    assessment: null,
  }) as LossClaim;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('sessionStorage', createMemoryStorage());
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn() } });
  window.history.replaceState(null, '', '/');
  api.listClaims.mockResolvedValue([claimFor('c_1')]);
  api.getClaim.mockImplementation(async (id: string) => claimFor(id));
  api.getClaimProgress.mockImplementation(async (id: string) => progressFor('checks_running', { claimId: id }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'geolocation');
  window.history.replaceState(null, '', '/');
});

describe('App + real ClaimsPage routing', () => {
  it('RT-6: loading #/claims/c_1 shows that claim\'s tracker; Back to my claims goes to #/claims', async () => {
    window.history.replaceState(null, '', '/#/claims/c_1');
    render(<App />);
    const tracker = await screen.findByTestId('claim-tracker');
    expect(tracker).toHaveAttribute('data-claim-id', 'c_1');
    await waitFor(() => expect(tracker).toHaveAttribute('data-overall-status', 'in_progress'));
    expect(api.getClaim).toHaveBeenCalledWith('c_1');
    expect(api.getClaimProgress).toHaveBeenCalledWith('c_1', expect.anything());
    expect(api.listClaims).not.toHaveBeenCalled();
    expect(api.verifyClaimRequest).not.toHaveBeenCalled();

    await userEvent.click(within(tracker).getByRole('button', { name: 'Back to my claims' }));
    expect(window.location.hash).toBe('#/claims');
    expect(await screen.findByText('My Claims')).toBeInTheDocument();
  });

  it('RT-6: opening a claim from the list pushes #/claims/<id>; finishing the wizard replaces #/claims/new with the claim', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/#/claims');
    const view = render(<App />);
    await user.click(await screen.findByRole('button', { name: /flood/i }));
    expect(window.location.hash).toBe('#/claims/c_1');
    expect(await screen.findByTestId('claim-tracker')).toHaveAttribute('data-claim-id', 'c_1');
    view.unmount();

    window.history.replaceState(null, '', '/#/claims');
    window.history.pushState(null, '', '/#/claims/new');
    const length = window.history.length;
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'finish wizard' }));
    expect(window.location.hash).toBe('#/claims/c_9');
    expect(window.history.length).toBe(length);
    expect(await screen.findByTestId('claim-tracker')).toHaveAttribute('data-claim-id', 'c_9');
    act(() => window.history.back());
    expect(await screen.findByText('My Claims')).toBeInTheDocument();
  });
});
