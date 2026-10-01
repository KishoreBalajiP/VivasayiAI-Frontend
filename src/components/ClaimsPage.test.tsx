// Component-level tests for the farmer claim detail view's lifecycle actions.
//
// The property under test: a claim is never stranded. `draft` offers Submit (the backend refuses
// to verify anything unsubmitted, so an unsubmitted claim is a dead end), and no other state does.
// The frontend never invents a `verified` outcome — it only ever renders what the backend returns.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import '../i18n';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClaim.mockResolvedValue(claimFor('draft'));
  mockListClaims.mockResolvedValue([claimFor('draft')]);
  mockSubmitClaim.mockResolvedValue(claimFor('submitted'));
});

const { mockGetClaim, mockListClaims, mockSubmitClaim, mockVerify, mockWithdraw, mockResubmit } =
  vi.hoisted(() => ({
    mockGetClaim: vi.fn(),
    mockListClaims: vi.fn(),
    mockSubmitClaim: vi.fn(),
    mockVerify: vi.fn(),
    mockWithdraw: vi.fn(),
    mockResubmit: vi.fn(),
  }));

vi.mock('../api/client', () => ({
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(status: number) {
      super(`api ${status}`);
      this.status = status;
    }
  },
  friendlyMessageKey: () => 'genericError',
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock('../api/claims', () => ({
  listClaims: mockListClaims,
  getClaim: mockGetClaim,
  createClaim: vi.fn(),
  submitClaim: mockSubmitClaim,
  withdrawClaim: mockWithdraw,
  resubmitClaim: mockResubmit,
  verifyClaimRequest: mockVerify,
  uploadClaimEvidence: vi.fn(),
  listParcels: vi.fn().mockResolvedValue([]),
}));

// The gallery mints signed URLs; not the subject of these tests.
vi.mock('./ClaimEvidenceGallery', () => ({
  default: () => <div data-testid="evidence-gallery" />,
}));

import { ClaimsPage } from './ClaimsPage';
import { ApiClientError } from '../api/client';
import type { ClaimState, LossClaim } from '../types';

const claimFor = (state: ClaimState, overrides: Partial<LossClaim> = {}): LossClaim =>
  ({
    id: 'c_1',
    parcelId: 'par_1',
    parcelSnapshot: { parcelId: 'par_1', name: 'North Field', crop: 'Rice', parcelAreaAcres: 1.25 },
    eventType: 'flood',
    eventDate: '2026-09-20',
    claimedGeometry: {
      type: 'Polygon',
      coordinates: [[[79.11, 10.71], [79.19, 10.71], [79.19, 10.79], [79.11, 10.79], [79.11, 10.71]]],
    },
    // Server-measured partial area — must never be the parcel total.
    claimedAreaAcres: 1.4678,
    evidence: [],
    state,
    submittedAt: state === 'draft' ? null : '2026-09-21T00:00:00.000Z',
    processedAt: null,
    decidedAt: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    assessment: null,
    ...overrides,
  }) as LossClaim;

/** Open My Claims → the claim card → the detail view. Returns the render handle for cleanup. */
const openClaim = async (user: ReturnType<typeof userEvent.setup>) => {
  const view = render(<ClaimsPage profile={null} />);
  const card = await screen.findByRole('button', { name: /flood/i });
  await user.click(card);
  await waitFor(() => expect(screen.getByText('Claim details')).toBeInTheDocument());
  return view;
};

describe('draft claim actions', () => {
  it('offers Submit for a draft claim, which the backend alone would never verify', async () => {
    const user = userEvent.setup();
    await openClaim(user);

    expect(screen.getByRole('button', { name: /submit claim/i })).toBeInTheDocument();
    // No verify affordance: the backend rejects verify for anything not submitted.
    expect(screen.queryByRole('button', { name: /run ai verification/i })).not.toBeInTheDocument();
  });

  it('submits the draft and refetches so the displayed state comes from the backend', async () => {
    const user = userEvent.setup();
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => expect(mockSubmitClaim).toHaveBeenCalledWith('c_1'));
    // The view re-reads the claim rather than trusting the submit response for display.
    await waitFor(() => expect(mockGetClaim.mock.calls.length).toBeGreaterThan(1));
    // The success toast is gated on the state the backend actually returned.
    expect(toast.success).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports failure and does not claim success when submit returns a non-submitted state', async () => {
    const user = userEvent.setup();
    mockSubmitClaim.mockResolvedValue(claimFor('draft'));
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers Submit only for draft — a submitted claim shows Verify instead', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    await openClaim(user);

    expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run ai verification/i })).toBeInTheDocument();
  });

  it('offers no submit action for any terminal state', async () => {
    for (const state of ['verified', 'rejected', 'withdrawn', 'out_of_limit'] as ClaimState[]) {
      mockGetClaim.mockResolvedValue(claimFor(state));
      mockListClaims.mockResolvedValue([claimFor(state)]);
      const user = userEvent.setup();
      const view = await openClaim(user);
      expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('backend-authoritative areas', () => {
  it('renders the server claimed area and the parcel total as separate numbers', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    await openClaim(user);

    const claimedRow = screen.getByText('Claimed area').closest('div')!;
    expect(claimedRow).toHaveTextContent('1.4678');
    expect(claimedRow).not.toHaveTextContent('1.25');

    const parcelRow = screen.getByText('Parcel area').closest('div')!;
    expect(parcelRow).toHaveTextContent('1.25');
  });
});

// AI-503-FE5/FE6: a failing /verify (bounded AI timeout or provider error) must surface the
// recoverable, claim-preserving message, issue exactly one request, never auto-retry, and never
// fabricate a decision.
describe('verification AI failure handling', () => {
  const AI_UNAVAILABLE = /AI verifier did not respond in time/i;

  it('surfaces the recoverable AI message on a 503 and never claims a decision', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockVerify.mockRejectedValue(new ApiClientError(503, 'verificationAiUnavailable'));
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /run ai verification/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(AI_UNAVAILABLE);
    // No success toast and no fabricated verification result panel.
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('Verification result')).not.toBeInTheDocument();
  });

  it('maps a 500 the same way and issues exactly one verify request (no auto-retry)', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockVerify.mockRejectedValue(new ApiClientError(500, 'verificationAiUnavailable'));
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /run ai verification/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(AI_UNAVAILABLE);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith('c_1');
  });

  it('leaves a 429 on the rate-limit message and does not convert it to an AI failure', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockVerify.mockRejectedValue(new ApiClientError(429, 'rateLimited'));
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /run ai verification/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).not.toMatch(AI_UNAVAILABLE);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});
