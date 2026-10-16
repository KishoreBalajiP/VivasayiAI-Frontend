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
  mockListOwnership.mockResolvedValue({ claimId: 'c_1', evidence: [], summary: {} });
  mockGetAppeal.mockResolvedValue(null);
});

const {
  mockGetClaim,
  mockListClaims,
  mockSubmitClaim,
  mockVerify,
  mockWithdraw,
  mockResubmit,
  mockGetVerification,
  mockListOwnership,
  mockGetAppeal,
} = vi.hoisted(() => ({
  mockGetClaim: vi.fn(),
  mockListClaims: vi.fn(),
  mockSubmitClaim: vi.fn(),
  mockVerify: vi.fn(),
  mockWithdraw: vi.fn(),
  mockResubmit: vi.fn(),
  mockGetVerification: vi.fn(),
  mockListOwnership: vi.fn(),
  mockGetAppeal: vi.fn(),
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
  getClaimVerification: mockGetVerification,
  uploadClaimEvidence: vi.fn(),
  listParcels: vi.fn().mockResolvedValue([]),
  listOwnershipEvidence: mockListOwnership,
  getOwnershipDocumentUrl: vi.fn(),
  uploadOwnershipDocument: vi.fn(),
  OWNERSHIP_DOCUMENT_ACCEPT: 'image/jpeg,image/png,image/webp',
  getAppeal: mockGetAppeal,
  submitAppeal: vi.fn(),
}));

// The gallery mints signed URLs; not the subject of these tests.
vi.mock('./ClaimEvidenceGallery', () => ({
  default: () => <div data-testid="evidence-gallery" />,
}));

import { ClaimsPage } from './ClaimsPage';
import { ApiClientError } from '../api/client';
import type { ClaimAssessment, ClaimState, LossClaim, VerificationDecision } from '../types';

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

// ── ADR-020 held claims, status polling and decided-claim rendering ───────────────────────

const decisionFor = (overrides: Partial<VerificationDecision> = {}): VerificationDecision => ({
  claimId: 'c_1',
  idempotent: false,
  inProgress: false,
  claimState: 'submitted',
  outcome: null,
  decision: null,
  reason: null,
  rules: null,
  approvedGeometry: null,
  approvedAreaAcres: null,
  verifiedAreaAcres: null,
  remainingEligible: null,
  previouslyVerifiedAcres: null,
  inFlightAreaAcres: null,
  overlapWarnings: [],
  spatialEvaluated: false,
  weatherCorrelation: null,
  decidedAt: null,
  decidedBy: null,
  claimedAreaAcres: 1.4678,
  parcelAreaAcres: 1.25,
  evidenceVersion: null,
  engineVersion: null,
  ...overrides,
});

const heldDecision = () =>
  decisionFor({
    held: true,
    pendingComponents: [{ component: 'claimant_rights', outcome: 'unverified', action: 'more_evidence_required' }],
    components: {
      claimant_rights: {
        outcome: 'unverified',
        required: true,
        authoritative: false,
        actionableBy: 'farmer',
        reasonCodes: ['missing_document_category:lease_agreement', 'relationship_tenant'],
      },
      satellite: {
        outcome: 'unavailable',
        required: false,
        authoritative: false,
        actionableBy: 'system',
        reasonCodes: ['satellite_unavailable_or_disabled'],
      },
      land_documents: {
        outcome: 'inconclusive',
        required: false,
        authoritative: false,
        actionableBy: 'system',
        reasonCodes: ['document_consistent_not_authentic_proof'],
      },
    },
    policyId: 'p-2026-10',
    policyHash: 'abc',
  });

describe('held verification (no decision yet)', () => {
  it('shows the component checklist instead of a running spinner or a decision', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockVerify.mockResolvedValue(heldDecision());
    await openClaim(user);

    await user.click(screen.getByRole('button', { name: /run ai verification/i }));

    const checklist = await screen.findByTestId('held-checklist');
    expect(checklist).toHaveTextContent('No decision yet');
    // Farmer-actionable wording names the missing document category.
    expect(checklist).toHaveTextContent('We still need: Lease agreement');
    // unavailable / inconclusive are never failures.
    expect(checklist).toHaveTextContent('Could not be checked yet. This is not a problem with your claim.');
    expect(checklist).toHaveTextContent('Not enough information. This does not count against you.');
    expect(checklist).not.toHaveTextContent(/rejected|approved/i);
    // No "running" state, no decision card, and no polling for a hold.
    expect(screen.queryByText('The system is verifying your claim. This can take a moment.')).not.toBeInTheDocument();
    expect(screen.queryByText('Verification result')).not.toBeInTheDocument();
    expect(screen.queryByText('No verification result yet.')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockGetVerification).not.toHaveBeenCalled();
    // The claim is still submitted, so it can still be withdrawn.
    expect(screen.getByRole('button', { name: /withdraw claim/i })).toBeInTheDocument();
  });

  it('renders the checklist from a persisted held assessment on load', async () => {
    const user = userEvent.setup();
    const held = heldDecision();
    const assessment = {
      approvedGeometry: null,
      approvedAreaAcres: null,
      aiAggregate: null,
      weatherCorrelation: null,
      rules: null,
      state: null,
      reason: null,
      decidedAt: null,
      decidedBy: null,
      adminNote: null,
      held: true,
      pendingComponents: held.pendingComponents,
      components: held.components,
    } as ClaimAssessment;
    mockGetClaim.mockResolvedValue(claimFor('submitted', { assessment }));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    await openClaim(user);

    expect(await screen.findByTestId('held-checklist')).toBeInTheDocument();
  });
});

describe('verification status polling', () => {
  it('polls GET /claims/:id/verification at 10 s and stops on a decision', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockGetClaim.mockResolvedValue(claimFor('submitted'));
      mockListClaims.mockResolvedValue([claimFor('submitted')]);
      mockVerify.mockResolvedValue(decisionFor({ inProgress: true, claimState: 'processing' }));
      const decided = claimFor('rejected', {
        assessment: {
          approvedGeometry: null,
          approvedAreaAcres: 0,
          aiAggregate: null,
          weatherCorrelation: null,
          rules: { weatherCheck: { passed: false }, areaCheck: { passed: true } },
          state: 'rejected',
          reason: 'Photos do not show damage',
          decidedAt: '2026-09-22T00:00:00.000Z',
          decidedBy: 'engine',
          adminNote: null,
        },
      });
      mockGetVerification
        .mockResolvedValueOnce({ verification: {}, claim: claimFor('processing') })
        .mockResolvedValueOnce({ verification: {}, claim: decided });
      await openClaim(user);

      await user.click(screen.getByRole('button', { name: /run ai verification/i }));
      await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));

      // Nothing is read before the 10 s floor.
      await vi.advanceTimersByTimeAsync(9_000);
      expect(mockGetVerification).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_500);
      await waitFor(() => expect(mockGetVerification).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(10_500);
      await waitFor(() => expect(mockGetVerification).toHaveBeenCalledTimes(2));
      expect(mockGetVerification).toHaveBeenCalledWith('c_1');

      // Decided: the persisted result renders with the claim's real areas, and polling stops.
      expect(await screen.findByText('Verification result')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockGetVerification).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('decided claim rendering', () => {
  const rejected = () =>
    claimFor('rejected', {
      assessment: {
        approvedGeometry: null,
        approvedAreaAcres: 0,
        aiAggregate: null,
        weatherCorrelation: null,
        rules: { weatherCheck: { passed: false }, areaCheck: { passed: true } },
        state: 'rejected',
        reason: 'Photos do not show damage',
        decidedAt: '2026-09-22T00:00:00.000Z',
        decidedBy: 'engine',
        adminNote: null,
      },
    });

  it('shows the claim\'s real claimed and parcel areas (no zero placeholders)', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(rejected());
    mockListClaims.mockResolvedValue([rejected()]);
    await openClaim(user);

    const claimedResult = (await screen.findByText('Claimed area', { selector: 'dt.text-xs' })).closest('div')!;
    expect(claimedResult).toHaveTextContent('1.4678');
    const parcelResult = screen.getByText('Parcel area', { selector: 'dt.text-xs' }).closest('div')!;
    expect(parcelResult).toHaveTextContent('1.25');
  });

  it('lists the weather rule as supporting info, never as passed or failed', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(rejected());
    mockListClaims.mockResolvedValue([rejected()]);
    await openClaim(user);

    const weatherRow = (await screen.findByText('Weather check', { selector: 'span' })).closest('li')!;
    expect(weatherRow).toHaveTextContent('Supporting info only');
    expect(weatherRow).not.toHaveTextContent('Failed');
    expect(weatherRow).not.toHaveTextContent('Passed');
  });

  it('offers an appeal on a rejected claim and none on a submitted one', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(rejected());
    mockListClaims.mockResolvedValue([rejected()]);
    const view = await openClaim(user);
    expect(await screen.findByRole('button', { name: /appeal decision/i })).toBeInTheDocument();
    expect(mockGetAppeal).toHaveBeenCalledWith('c_1');
    view.unmount();

    mockGetAppeal.mockClear();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    await openClaim(user);
    expect(screen.queryByRole('button', { name: /appeal decision/i })).not.toBeInTheDocument();
    expect(mockGetAppeal).not.toHaveBeenCalled();
  });
});
