// Component-level tests for the farmer claim page (the claim tracker since plan B4) and its
// lifecycle actions.
//
// The property under test: a claim is never stranded. `draft` offers Submit (checks only start
// after a submit, so an unsubmitted claim is a dead end), and no other state does. Nothing in the
// farmer flow asks for verification: checks start on their own and the page only reads progress.
// The frontend never invents a `verified` outcome — it only ever renders what the backend returns.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import '../i18n';

beforeEach(() => {
  vi.clearAllMocks();
  // The tracker keeps a progress snapshot in sessionStorage; each test starts without one.
  vi.stubGlobal('sessionStorage', createMemoryStorage());
  // The claims subview now comes from the URL hash, which jsdom keeps between tests.
  window.history.replaceState(null, '', '/');
  mockGetClaim.mockResolvedValue(claimFor('draft'));
  mockListClaims.mockResolvedValue([claimFor('draft')]);
  mockSubmitClaim.mockResolvedValue(claimFor('submitted'));
  mockListOwnership.mockResolvedValue({ claimId: 'c_1', evidence: [], summary: {} });
  mockGetAppeal.mockResolvedValue(null);
  // GET /claims/:id/progress answers for whatever claim GET /claims/:id currently returns (read
  // through the mock's implementation, so it does not count as a claim read).
  mockGetProgress.mockImplementation(async (claimId: string) => {
    const claim = (await mockGetClaim.getMockImplementation()?.(claimId)) as LossClaim | undefined;
    return claim ? progressForClaim(claim) : null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
  mockGetProgress,
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
  mockGetProgress: vi.fn(),
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
  // Still exported by the API module; the farmer UI must never call it (TRK-6).
  verifyClaimRequest: mockVerify,
  getClaimVerification: mockGetVerification,
  getClaimProgress: mockGetProgress,
  uploadClaimEvidence: vi.fn(),
  // Handed to the wizard (document upload/attach, photo delete, tracked submit).
  submitClaimTracked: vi.fn(),
  attachOwnershipEvidence: vi.fn(),
  deleteEvidenceUpload: vi.fn(),
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

// The wizard has its own suite (ClaimWizard.test.tsx). Here only its exits matter: where finishing,
// opening the saved claim and cancelling take the farmer, and what the page hands it.
const { wizardProps } = vi.hoisted(() => ({ wizardProps: { current: null as Record<string, unknown> | null } }));
vi.mock('./ClaimWizard', () => ({
  ClaimWizard: (props: Record<string, unknown>) => {
    wizardProps.current = props;
    const call = (name: string, ...args: unknown[]) => () => (props[name] as (...a: unknown[]) => void)(...args);
    return (
      <div data-testid="wizard-stub">
        <button type="button" onClick={call('onDone', { id: 'c_9', state: 'submitted' })}>finish wizard</button>
        <button type="button" onClick={call('onOpenClaim', 'c_8')}>open saved claim</button>
        <button type="button" onClick={call('onCancel')}>cancel wizard</button>
      </div>
    );
  },
}));

import { ClaimsPage } from './ClaimsPage';
import { ApiClientError } from '../api/client';
import { createMemoryStorage } from '../test/memoryStorage';
import { progressFor } from '../test/progressFixtures';
import type { ClaimAssessment, ClaimProgress, ClaimState, LossClaim, VerificationDecision } from '../types';

// A backend example (src/test/fixtures/progress-v1.example.json) per claim state; the claim's own
// state and decision are copied in so the progress always agrees with GET /claims/:id.
const PROGRESS_BY_STATE: Record<ClaimState, string> = {
  draft: 'draft_ready',
  submitted: 'checks_running',
  processing: 'deciding',
  verified: 'decided_verified',
  partially_verified: 'decided_verified',
  rejected: 'decided_by_reviewer',
  out_of_limit: 'decided_by_reviewer',
  duplicate_area: 'decided_by_reviewer',
  more_evidence_required: 'more_evidence_required',
  withdrawn: 'withdrawn_after_submit',
};
const DECISIONS: string[] = ['verified', 'partially_verified', 'rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'];
const progressForClaim = (claim: LossClaim): ClaimProgress => {
  const held = claim.state === 'submitted' && claim.assessment?.held;
  const example = progressFor(held ? 'held_ai_no_damage' : PROGRESS_BY_STATE[claim.state], { claimId: claim.id });
  return {
    ...example,
    claimState: claim.state,
    decision: DECISIONS.includes(claim.state) ? (claim.state as ClaimProgress['decision']) : null,
  };
};

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
  // Start from My Claims: opening a claim puts it in the URL hash, which outlives an unmount.
  window.history.replaceState(null, '', '/');
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

  // Migrated (plan B4): a submitted claim used to offer "Run AI verification". Checks now start on
  // their own after submit, so a submitted claim offers neither Submit nor any verify action, and
  // its page follows the checks instead.
  it('offers Submit only for draft — a submitted claim offers no verify action and shows its checks', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    await openClaim(user);

    expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run ai verification|verify/i })).not.toBeInTheDocument();
    expect(await screen.findAllByTestId('tracker-stage')).toHaveLength(6);
    expect(mockGetProgress).toHaveBeenCalledWith('c_1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mockVerify).not.toHaveBeenCalled();
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

// AI-503-FE5/FE6, migrated (plan B4). The farmer no longer calls /verify, so a provider failure
// can no longer reach the page as a failed request: it shows up as a stage waiting on an automatic
// retry. What these tests protect is unchanged: a failure is recoverable, the claim stays saved,
// nothing fabricates a decision, and the farmer is never asked to run verification.
describe('status read failure handling (formerly verification AI failure handling)', () => {
  it('a failing progress read (503) shows the recoverable error with Retry and never claims a decision', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockGetProgress.mockRejectedValue(new ApiClientError(503, 'serviceBusy'));
    await openClaim(user);

    const banner = await screen.findByTestId('tracker-refresh-error');
    expect(banner).toHaveTextContent('The progress of this claim could not be loaded');
    expect(within(banner).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByTestId('decision-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Verification result')).not.toBeInTheDocument();
    expect(mockVerify).not.toHaveBeenCalled();
    // The claim itself is still shown: it is saved, whatever the status read did.
    expect(screen.getByText('Claimed area').closest('div')).toHaveTextContent('1.4678');
  });

  it('a provider failure being retried is shown as a waiting check, never as a rejection or "more evidence"', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockGetProgress.mockResolvedValue(progressFor('retrying_event_today', { claimId: 'c_1' }));
    await openClaim(user);

    const photos = (await screen.findAllByTestId('tracker-stage')).find((el) => el.getAttribute('data-stage-id') === 'photos')!;
    expect(photos).toHaveAttribute('data-stage-status', 'waiting');
    expect(photos).toHaveTextContent('this is not a problem with your photos');
    expect(document.body).not.toHaveTextContent(/rejected|more evidence required/i);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('a 429 on the status read keeps the page and does not turn into an AI-failure message', async () => {
    const user = userEvent.setup();
    mockGetClaim.mockResolvedValue(claimFor('submitted'));
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    mockGetProgress.mockRejectedValue(new ApiClientError(429, 'rateLimited'));
    await openClaim(user);

    expect(await screen.findByTestId('tracker-refresh-error')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/AI verifier did not respond in time/i);
    // One read on open; the next one waits for the rate-limit back-off (at least a minute).
    expect(mockGetProgress).toHaveBeenCalledTimes(1);
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
  // Migrated (plan B4): the hold used to appear after pressing "Run AI verification". It now comes
  // from the persisted assessment and the progress read; the checklist sits in a closed <details>.
  it('shows the component checklist instead of a running spinner or a decision', async () => {
    const user = userEvent.setup();
    const held = heldDecision();
    const heldClaim = claimFor('submitted', {
      assessment: {
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
      } as ClaimAssessment,
    });
    mockGetClaim.mockResolvedValue(heldClaim);
    mockListClaims.mockResolvedValue([claimFor('submitted')]);
    await openClaim(user);

    const details = await screen.findByTestId('tracker-held-details');
    expect(details).not.toHaveAttribute('open');
    const checklist = within(details).getByTestId('held-checklist');
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
    expect(mockVerify).not.toHaveBeenCalled();
    expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'waiting_for_review');
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

// Migrated (plan B4/B5): polling used to start from the verify button and read
// GET /claims/:id/verification. The tracker now polls GET /claims/:id/progress on its own from
// the moment the claim opens, never faster than every 10 s, and stops on a decision.
describe('status polling', () => {
  it('polls GET /claims/:id/progress at the 10 s floor and stops on a decision', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockGetClaim.mockResolvedValue(claimFor('submitted'));
      mockListClaims.mockResolvedValue([claimFor('submitted')]);
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
      mockGetProgress
        .mockReset()
        .mockResolvedValueOnce(progressForClaim(claimFor('submitted')))
        .mockResolvedValueOnce({ ...progressForClaim(decided), lastUpdatedAt: '2026-10-16T09:30:00.000Z' });
      await openClaim(user);
      await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(1));
      mockGetClaim.mockResolvedValue(decided);

      // Nothing is read again before the 10 s floor.
      await vi.advanceTimersByTimeAsync(7_000);
      expect(mockGetProgress).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(2));
      expect(mockGetProgress).toHaveBeenCalledWith('c_1', expect.anything());
      expect(mockGetVerification).not.toHaveBeenCalled();

      // Decided: the claim is read again, the persisted result renders, and polling stops.
      expect(await screen.findByText('Verification result')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(mockGetProgress).toHaveBeenCalledTimes(2);
      expect(mockVerify).not.toHaveBeenCalled();
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

// ── Routing (plan B2): the subview comes from the hash ─────────────────────────────────────────

describe('claims routing', () => {
  it('RT-6: #/claims/c_1 opens that claim directly', async () => {
    window.history.replaceState(null, '', '/#/claims/c_1');
    render(<ClaimsPage profile={null} />);
    await waitFor(() => expect(screen.getByText('Claim details')).toBeInTheDocument());
    expect(mockGetClaim).toHaveBeenCalledWith('c_1');
    expect(mockListClaims).not.toHaveBeenCalled();
  });

  it('RT-6: opening a claim pushes #/claims/<id>; its back arrow returns to the list', async () => {
    const user = userEvent.setup();
    const before = window.history.length;
    await openClaim(user);
    expect(window.location.hash).toBe('#/claims/c_1');
    expect(window.history.length).toBe(before + 1);

    await user.click(screen.getByRole('button', { name: /back to my claims/i }));
    expect(window.location.hash).toBe('#/claims');
    expect(await screen.findByRole('button', { name: /flood/i })).toBeInTheDocument();
  });

  it('RT-6: browser Back from a claim shows the list again', async () => {
    const user = userEvent.setup();
    await openClaim(user);
    act(() => window.history.back());
    expect(await screen.findByRole('button', { name: /flood/i })).toBeInTheDocument();
    expect(screen.queryByText('Claim details')).not.toBeInTheDocument();
  });

  it('RT-6: "File a claim" opens the wizard at #/claims/new with every upload handler wired', async () => {
    const user = userEvent.setup();
    mockListClaims.mockResolvedValue([]);
    render(<ClaimsPage profile={null} />);
    await user.click(await screen.findByRole('button', { name: 'File a claim' }));
    expect(window.location.hash).toBe('#/claims/new');
    expect(await screen.findByTestId('wizard-stub')).toBeInTheDocument();
    for (const name of ['onCreateClaim', 'onUploadEvidence', 'onSubmitClaim', 'onUploadDocumentFile', 'onAttachDocument', 'onDeleteEvidence']) {
      expect(typeof wizardProps.current?.[name], name).toBe('function');
    }
  });

  it('RT-6: finishing the wizard REPLACES #/claims/new with the claim, so Back never re-enters it', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/#/claims');
    window.history.pushState(null, '', '/#/claims/new');
    const length = window.history.length;
    render(<ClaimsPage profile={null} />);
    await user.click(await screen.findByRole('button', { name: 'finish wizard' }));

    expect(window.location.hash).toBe('#/claims/c_9');
    expect(window.history.length).toBe(length);
    await waitFor(() => expect(mockGetClaim).toHaveBeenCalledWith('c_9'));

    act(() => window.history.back());
    expect(await screen.findByText('My Claims')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/claims');
  });

  it('RT-6: "Open saved claim" also replaces the wizard; cancel replaces it with the list', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/#/claims/new');
    const length = window.history.length;
    const view = render(<ClaimsPage profile={null} />);
    await user.click(await screen.findByRole('button', { name: 'open saved claim' }));
    expect(window.location.hash).toBe('#/claims/c_8');
    expect(window.history.length).toBe(length);
    view.unmount();

    window.history.replaceState(null, '', '/#/claims/new');
    render(<ClaimsPage profile={null} />);
    await user.click(await screen.findByRole('button', { name: 'cancel wizard' }));
    expect(window.location.hash).toBe('#/claims');
    expect(window.history.length).toBe(length);
  });
});

// UX-06 + D4: the claims list. The container matches the detail page width, the header carries
// supporting copy, and a card shows a next-step hint ONLY for a state whose action the existing
// workflow already supports (never for a state the farmer can only wait on).
describe('claims list layout and next-step hints', () => {
  const renderList = async (claims: LossClaim[]) => {
    mockListClaims.mockResolvedValue(claims);
    window.history.replaceState(null, '', '/#/claims');
    render(<ClaimsPage profile={null} />);
    return screen.findByRole('heading', { name: 'My Claims' });
  };

  it('uses the same max-w-5xl container as the claim detail page and shows supporting copy', async () => {
    const heading = await renderList([claimFor('draft')]);
    const container = heading.closest('div.mx-auto') as HTMLElement;
    expect(container.className).toContain('max-w-5xl');
    expect(container.className).not.toContain('max-w-4xl');
    expect(screen.getByText('Every claim you have filed, with its current status.')).toBeInTheDocument();
  });

  it('shows the submit next step for a draft claim', async () => {
    await renderList([claimFor('draft')]);
    const hint = await screen.findByTestId('claim-next-step');
    expect(hint).toHaveTextContent('Next step:');
    expect(hint).toHaveTextContent('Submit this claim to start the checks');
  });

  it('shows the resubmit next step for more_evidence_required, not the appeal', async () => {
    await renderList([claimFor('more_evidence_required')]);
    const hint = await screen.findByTestId('claim-next-step');
    expect(hint).toHaveTextContent('Add the requested evidence and resubmit');
    expect(hint).not.toHaveTextContent('appeal');
  });

  it('shows the appeal next step for an appealable decision', async () => {
    await renderList([claimFor('rejected')]);
    expect(await screen.findByTestId('claim-next-step')).toHaveTextContent('You can appeal this decision');
  });

  it('shows no next-step hint for states with no supported farmer action', async () => {
    await renderList([
      claimFor('submitted', { id: 'c_sub' }),
      claimFor('verified', { id: 'c_ver' }),
      claimFor('withdrawn', { id: 'c_wd' }),
    ]);
    expect(await screen.findAllByRole('button', { name: /flood/i })).toHaveLength(3);
    expect(screen.queryByTestId('claim-next-step')).not.toBeInTheDocument();
  });

  it('keeps the card button opening the claim detail with the hint present', async () => {
    const user = userEvent.setup();
    await renderList([claimFor('draft')]);
    await screen.findByTestId('claim-next-step');
    await user.click(screen.getByRole('button', { name: /flood/i }));
    await waitFor(() => expect(window.location.hash).toBe('#/claims/c_1'));
  });
});

