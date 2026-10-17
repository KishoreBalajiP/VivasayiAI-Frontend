// TRK-1..16: the claim tracker (plan B4, design §7) against the backend builder's own example
// output. The selector contract asserted here is what the Playwright stage relies on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import i18n from '../../i18n';
import { enV2 } from '../../locales/v2.en';
import { createMemoryStorage } from '../../test/memoryStorage';
import { PROGRESS_EXAMPLES, progressFor } from '../../test/progressFixtures';
import { formatUtcDate, PROGRESS_CONTRACT } from '../../utils/claimProgress';
import { ApiClientError } from '../../api/client';
import type { ClaimAssessment, ClaimProgress, ClaimState, LossClaim, SatelliteProgress } from '../../types';

const api = vi.hoisted(() => ({
  getClaim: vi.fn(),
  getClaimProgress: vi.fn(),
  getClaimVerification: vi.fn(),
  submitClaim: vi.fn(),
  withdrawClaim: vi.fn(),
  resubmitClaim: vi.fn(),
  verifyClaimRequest: vi.fn(),
  listOwnershipEvidence: vi.fn(),
  getAppeal: vi.fn(),
  getEvidenceUrl: vi.fn(),
}));

vi.mock('../../api/claims', () => ({
  ...api,
  submitAppeal: vi.fn(),
  uploadClaimEvidence: vi.fn(),
  deleteEvidenceUpload: vi.fn(),
  getOwnershipDocumentUrl: vi.fn(),
  uploadOwnershipDocument: vi.fn(),
  OWNERSHIP_DOCUMENT_ACCEPT: 'image/jpeg,image/png,image/webp',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { ClaimTracker } from './ClaimTracker';

const CLAIM_ID = '6710c0ffee0000000000abcd';
const REFERENCE = '0000ABCD';

const claimFor = (state: ClaimState, overrides: Partial<LossClaim> = {}): LossClaim =>
  ({
    id: CLAIM_ID,
    parcelId: 'par_1',
    parcelSnapshot: { parcelId: 'par_1', name: 'North Field', crop: 'Rice', parcelAreaAcres: 1.25 },
    eventType: 'flood',
    eventDate: '2026-10-10T00:00:00.000Z',
    claimedGeometry: { type: 'Polygon', coordinates: [] },
    claimedAreaAcres: 1.1,
    claimantRelationship: 'tenant',
    evidence: [],
    state,
    submittedAt: state === 'draft' ? null : '2026-10-16T09:00:00.000Z',
    processedAt: null,
    decidedAt: null,
    createdAt: '2026-10-16T08:50:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
    assessment: null,
    ...overrides,
  }) as LossClaim;

const decidedAssessment = (state: string, overrides: Partial<ClaimAssessment> = {}): ClaimAssessment => ({
  approvedGeometry: null,
  approvedAreaAcres: state === 'verified' ? 1.1 : 0,
  aiAggregate: null,
  weatherCorrelation: null,
  rules: { timelinessCheck: { passed: true }, areaCheck: { passed: true }, weatherCheck: { passed: true }, aiCheck: { passed: true } },
  state,
  reason: 'All deterministic verification rules passed',
  decidedAt: '2026-10-16T09:04:00.000Z',
  decidedBy: 'engine',
  adminNote: null,
  ...overrides,
});

const progress = (name: string, overrides: Partial<ClaimProgress> = {}): ClaimProgress => ({
  ...progressFor(name, { claimId: CLAIM_ID }),
  ...overrides,
});

const mockScenario = (name: string, claim: LossClaim = claimFor(progress(name).claimState), overrides: Partial<ClaimProgress> = {}) => {
  api.getClaim.mockResolvedValue(claim);
  api.getClaimProgress.mockResolvedValue(progress(name, overrides));
};

const renderTracker = async (language = 'en') => {
  const onBack = vi.fn();
  const view = render(<ClaimTracker claimId={CLAIM_ID} language={language} onBack={onBack} />);
  await waitFor(() => expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status'));
  await screen.findAllByTestId('tracker-stage');
  return { ...view, onBack };
};

const stageAttrs = () =>
  screen.getAllByTestId('tracker-stage').map((el) => [el.getAttribute('data-stage-id'), el.getAttribute('data-stage-status')]);

// Raw contract keys or internal codes must never be visible text.
const RAW_KEY = /\b(progress|action|satelliteReason|satelliteStatus|progressStatus|progressStage|decisionReason)[._][a-z_]+|PROVIDER_|rv_\d/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('sessionStorage', createMemoryStorage());
  api.listOwnershipEvidence.mockResolvedValue({ claimId: CLAIM_ID, evidence: [], summary: {} });
  api.getAppeal.mockResolvedValue(null);
  api.getEvidenceUrl.mockResolvedValue({ url: 'blob:thumb', expiresIn: 60 });
  api.verifyClaimRequest.mockRejectedValue(new Error('the farmer UI must never call /verify'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (i18n.language !== 'en') await act(async () => void (await i18n.changeLanguage('en')));
});

describe('ClaimTracker', () => {
  it('TRK-1: header shows the overall status, reference, event, submitted date and last update; selector attributes are the API values', async () => {
    mockScenario('retrying_event_today');
    await renderTracker();
    const tracker = screen.getByTestId('claim-tracker');
    expect(tracker).toHaveAttribute('data-claim-id', CLAIM_ID);
    expect(tracker).toHaveAttribute('data-overall-status', 'in_progress');
    expect(screen.getByText('Checks in progress')).toBeInTheDocument();
    expect(screen.getByText(REFERENCE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Copy reference ${REFERENCE}` })).toBeInTheDocument();
    expect(screen.getByText(/^Submitted /)).toBeInTheDocument();
    const lastUpdated = screen.getByTestId('tracker-last-updated');
    expect(lastUpdated).toHaveAttribute('data-last-updated', '2026-10-16T09:00:07.000Z');
    expect(lastUpdated).toHaveAttribute('datetime', '2026-10-16T09:00:07.000Z');
    expect(lastUpdated.textContent).toMatch(/^Last update /);
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claim details', level: 2 })).toBeInTheDocument();
  });

  it('TRK-2: shows the backend stages in backend order and nothing else', async () => {
    mockScenario('checks_running');
    await renderTracker();
    const raw = PROGRESS_EXAMPLES.checks_running.progress.stages as Array<{ id: string; status: string }>;
    expect(stageAttrs()).toEqual(raw.map((stage) => [stage.id, stage.status]));

    // A different list from the API (fewer stages, another order) is shown exactly as sent.
    const custom = progress('checks_running');
    api.getClaimProgress.mockResolvedValue({ ...custom, stages: [custom.stages[5], custom.stages[0], custom.stages[3]] });
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(stageAttrs()).toEqual([['decision', 'pending'], ['received', 'complete'], ['weather', 'active']]));
  });

  it('TRK-3: the current stage shows its explanation and its next check, and carries aria-current', async () => {
    mockScenario('retrying_event_today');
    await renderTracker();
    const photos = screen.getAllByTestId('tracker-stage').find((el) => el.getAttribute('data-stage-id') === 'photos')!;
    expect(photos).toHaveAttribute('aria-current', 'step');
    expect(photos).toHaveTextContent(enV2.progress_photos_retrying_technical);
    expect(within(photos).getByTestId('tracker-stage-next-check')).toHaveTextContent(/Next check around/);
    // A stage that has not started says nothing until it is the current one.
    const area = screen.getAllByTestId('tracker-stage').find((el) => el.getAttribute('data-stage-id') === 'area_checks')!;
    expect(area).not.toHaveTextContent(enV2.progress_area_checks_queued);
    expect(area).toHaveTextContent('Not started');
  });

  it('TRK-4: unknown keys, statuses and stages fall back to generic copy and never show a raw key', async () => {
    const base = progress('checks_running');
    mockScenario('checks_running', claimFor('submitted'), {
      overallStatus: 'unknown',
      stages: [
        { ...base.stages[0], explanationKey: null, status: 'unknown' },
        { ...base.stages[1], id: 'unknown', explanationKey: null },
        ...base.stages.slice(2),
      ],
      satellite: { ...base.satellite!, status: 'unknown', reasonCode: null },
      actionRequired: [{ code: 'unknown', stage: null, required: true, explanationKey: null, params: {} }],
    });
    const { container } = await renderTracker();
    // Overall pill, the unknown stage status and the satellite status all use generic copy.
    expect(screen.getAllByText(enV2.progressOverall_unknown).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(enV2.progressOverallBody_unknown)).toBeInTheDocument();
    expect(screen.getByText(enV2.progressStatusExplain_unknown)).toBeInTheDocument();
    expect(screen.getByText(enV2.progressStage_unknown)).toBeInTheDocument();
    expect(screen.getByText(enV2.satelliteStatusExplain_unknown)).toBeInTheDocument();
    expect(screen.getByText(enV2.action_unknown)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(RAW_KEY);
  });

  it('TRK-5: action callouts — required/recommended, document groups, resubmit through a dialog then refresh', async () => {
    mockScenario('more_evidence_required', claimFor('more_evidence_required', { assessment: decidedAssessment('more_evidence_required') }));
    await renderTracker();
    const actions = screen.getAllByTestId('claim-action');
    expect(actions.map((el) => el.getAttribute('data-action-code'))).toEqual(['upload_land_documents', 'resubmit_with_evidence']);
    expect(actions[0]).toHaveTextContent('Recommended');
    expect(actions[0]).toHaveTextContent('Any one of: Lease agreement');
    expect(actions[0]).toHaveTextContent('Any one of: Land record (patta / chitta) or Ownership deed or Land tax receipt');
    expect(actions[1]).toHaveTextContent('Required');

    const reads = api.getClaimProgress.mock.calls.length;
    api.resubmitClaim.mockResolvedValue(claimFor('submitted'));
    // The resubmission is a newer event than anything shown, so its lastUpdatedAt is later.
    api.getClaimProgress.mockResolvedValue(progress('submitted_fresh', { lastUpdatedAt: '2026-10-16T09:10:00.000Z' }));
    await userEvent.click(within(actions[1]).getByRole('button', { name: 'Add details and resubmit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resubmit this claim?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add details and resubmit' }));
    await waitFor(() => expect(api.resubmitClaim).toHaveBeenCalledWith(CLAIM_ID));
    await waitFor(() => expect(api.getClaimProgress.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'in_progress'));
  });

  it('TRK-5: "Add photos" moves focus to the photos section (scrollIntoView, not an anchor: the hash is the router)', async () => {
    mockScenario('submitted_without_photos');
    await renderTracker();
    const addPhotos = screen.getAllByTestId('claim-action').find((el) => el.getAttribute('data-action-code') === 'add_photos')!;
    await userEvent.click(within(addPhotos).getByRole('button', { name: 'Add photos' }));
    expect(document.activeElement).toContainElement(screen.getByRole('heading', { name: 'Evidence' }));
  });

  it('TRK-5: submit_claim on a draft submits, and on failure keeps an inline alert (not only a toast)', async () => {
    mockScenario('draft_ready', claimFor('draft'));
    api.submitClaim.mockRejectedValue(new ApiClientError(503, 'serviceBusy'));
    await renderTracker();
    const submit = screen.getAllByTestId('claim-action').find((el) => el.getAttribute('data-action-code') === 'submit_claim')!;
    await userEvent.click(within(submit).getByRole('button', { name: 'Submit claim' }));
    const alert = await within(submit).findByRole('alert');
    expect(alert).toHaveTextContent('Your claim is not submitted yet');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('TRK-6: no state renders a verify button, and verifyClaimRequest is never called', async () => {
    for (const [name, example] of Object.entries(PROGRESS_EXAMPLES)) {
      mockScenario(name, claimFor(example.progress.claimState as ClaimState));
      const view = await renderTracker();
      expect(screen.queryByRole('button', { name: /verif|run ai/i }), name).not.toBeInTheDocument();
      view.unmount();
    }
    expect(api.verifyClaimRequest).not.toHaveBeenCalled();
  });

  it('TRK-7: no percentage and no progress bar anywhere, in any state', async () => {
    for (const [name, example] of Object.entries(PROGRESS_EXAMPLES)) {
      mockScenario(name, claimFor(example.progress.claimState as ClaimState));
      const view = await renderTracker();
      expect(view.container.textContent, name).not.toContain('%');
      expect(screen.queryByRole('progressbar'), name).not.toBeInTheDocument();
      expect(view.container.querySelector('progress,[aria-valuenow]'), name).toBeNull();
      view.unmount();
    }
  });

  it('TRK-8: every satellite status renders truthfully: API value on the card, never success/danger, supporting note always; passed never says verified or proof', async () => {
    const base = progress('checks_running');
    for (const status of PROGRESS_CONTRACT.satellite.statuses) {
      const reasonCode = PROGRESS_CONTRACT.satellite.reasonCodes.find((entry) => entry.status === status)!.reasonCode;
      mockScenario('checks_running', claimFor('submitted'), {
        satellite: { ...base.satellite!, status: status as SatelliteProgress['status'], reasonCode },
      });
      const view = await renderTracker();
      const card = screen.getByTestId('tracker-satellite');
      expect(card, status).toHaveAttribute('data-satellite-status', status);
      expect(card).toHaveTextContent(enV2.satelliteSupportingNote);
      expect(card).toHaveTextContent(i18n.t(`satelliteStatus_${status}`));
      expect(card).toHaveTextContent(i18n.t(`satelliteReason_${reasonCode}`));
      expect(card.querySelector('[data-tone="success"],[data-tone="danger"]'), status).toBeNull();
      expect(['info', 'quiet']).toContain(within(card).getByTestId('tracker-satellite-status').getAttribute('data-tone'));
      expect(card.textContent, status).not.toMatch(/verified|proof/i);
      if (status === 'passed') {
        expect(within(card).getByTestId('tracker-satellite-status')).toHaveAttribute('data-tone', 'info');
        expect(card).toHaveTextContent('Supports your report');
      }
      view.unmount();
    }
  });

  it('TRK-9: windows ("starts …" while not open, no end date), imagery dates, next check, note code', async () => {
    mockScenario('retrying_event_today');
    const view = await renderTracker();
    const windows = screen.getByTestId('tracker-satellite-windows');
    expect(windows).toHaveTextContent(`After the event: starts ${formatUtcDate('2026-10-17T00:00:00.000Z', 'en')}`);
    expect(windows).toHaveTextContent(
      `Before the event: ${formatUtcDate('2026-09-06T00:00:00.000Z', 'en')} – ${formatUtcDate('2026-10-11T00:00:00.000Z', 'en')}`
    );
    expect(windows.querySelector('[data-post-open="false"]')?.textContent).not.toContain('–');
    expect(screen.getByTestId('tracker-satellite-next-check')).toHaveTextContent(/Next check around/);
    expect(screen.getByTestId('tracker-satellite')).toHaveTextContent(enV2.satelliteReason_waiting_for_post_event_imagery);
    view.unmount();

    const base = progress('held_waiting_for_reviewer');
    mockScenario('held_waiting_for_reviewer', claimFor('submitted'), {
      satellite: {
        ...base.satellite!,
        status: 'passed',
        reasonCode: 'vegetation_drop_consistent_with_damage',
        noteCode: 'latest_check_failed',
        observedWindows: {
          preEvent: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-25T00:00:00.000Z' },
          postEvent: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z', open: true, complete: false },
        },
        imageryDates: { preEvent: ['2026-08-05', '2026-08-15', '2026-08-25', '2026-09-04'], postEvent: ['2026-10-06'] },
      },
    });
    await renderTracker();
    const card = screen.getByTestId('tracker-satellite');
    expect(card).toHaveTextContent(`After the event: ${formatUtcDate('2026-10-01T00:00:00.000Z', 'en')} – still collecting`);
    expect(card).toHaveTextContent(
      `Before: ${['2026-08-05', '2026-08-15', '2026-08-25'].map((d) => formatUtcDate(d, 'en')).join(', ')} +1 more`
    );
    expect(card).toHaveTextContent(`After: ${formatUtcDate('2026-10-06', 'en')}`);
    expect(card).toHaveTextContent(enV2.satelliteNote_latest_check_failed);
  });

  it('TRK-10: a decided claim shows the decision card with translated reasons, never the backend English reason', async () => {
    const rejected = claimFor('rejected', {
      decidedAt: '2026-10-16T09:04:00.000Z',
      assessment: decidedAssessment('rejected', {
        reason: 'AI detected no crop damage in the submitted evidence',
        rules: { timelinessCheck: { passed: true }, aiCheck: { passed: false, reason: 'AI detected no crop damage' }, weatherCheck: { passed: false } },
        overlapWarnings: [{ code: 'overlaps_in_flight', message: 'The drawn area overlaps a claim still in progress' }],
      }),
    });
    mockScenario('decided_by_reviewer', rejected);
    const { container } = await renderTracker();
    const card = await screen.findByTestId('decision-card');
    expect(card).toHaveAttribute('data-decision', 'rejected');
    await waitFor(() => expect(card).toHaveTextContent('Verification result'));
    expect(card).toHaveTextContent(enV2.decisionReason_aiCheck_rejected);
    expect(card).toHaveTextContent(enV2.overlapWarning_overlaps_in_flight);
    expect(container.textContent).not.toContain('AI detected no crop damage');
    expect(container.textContent).not.toContain('The drawn area overlaps a claim still in progress');
    // Approved area renders as a proper <dt>/<dd> pair.
    const approved = within(card).getByText('Approved area');
    expect(approved.tagName).toBe('DT');
    expect(approved.nextElementSibling?.tagName).toBe('DD');
    // The weather rule stays supporting info, never failed.
    const weather = within(card).getByText('Weather check', { selector: 'span' }).closest('li')!;
    expect(weather).toHaveTextContent('Supporting info only');
    expect(weather).not.toHaveTextContent('Failed');
  });

  it('TRK-10: the decision card waits for the claim read, then never stays "loading" for a decision without a stored result', async () => {
    // GET /claims/:id is behind the progress read: the outcome shows at once, details are loading.
    let releaseClaim!: (claim: LossClaim) => void;
    api.getClaim.mockReturnValueOnce(new Promise<LossClaim>((resolve) => (releaseClaim = resolve)));
    api.getClaimProgress.mockResolvedValue(progress('decided_verified'));
    render(<ClaimTracker claimId={CLAIM_ID} language="en" onBack={vi.fn()} />);
    const card = await screen.findByTestId('decision-card');
    expect(card).toHaveAttribute('data-decision', 'verified');
    expect(card).toHaveTextContent(enV2.trackerDecisionLoading);
    // The claim (decided before results were stored: no assessment) catches up.
    api.getClaim.mockResolvedValue(claimFor('verified'));
    await act(async () => releaseClaim(claimFor('verified')));
    await waitFor(() => expect(card).not.toHaveTextContent(enV2.trackerDecisionLoading));
    expect(card).toHaveTextContent(enV2.decisionReason_outcome_verified);
    expect(within(card).getByText('Verified')).toBeInTheDocument();
  });

  it('TRK-10: a held claim keeps the checklist inside a closed "Details of each check" section', async () => {
    mockScenario(
      'held_ai_no_damage',
      claimFor('submitted', {
        assessment: {
          ...decidedAssessment('verified'),
          state: null,
          decidedAt: null,
          held: true,
          pendingComponents: [{ component: 'photos', outcome: 'requires_review', action: 'hold' }],
          components: { photos: { outcome: 'requires_review', required: true, authoritative: false, actionableBy: 'reviewer', reasonCodes: [] } },
        },
      })
    );
    await renderTracker();
    const details = await screen.findByTestId('tracker-held-details');
    expect(details.tagName).toBe('DETAILS');
    expect(details).not.toHaveAttribute('open');
    const checklist = within(details).getByTestId('held-checklist');
    expect(checklist).toHaveTextContent('A reviewer will check this');
    expect(checklist).toHaveAttribute('data-tone', 'info');
    expect(screen.queryByTestId('decision-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'waiting_for_review');
  });

  it('TRK-11: withdraw goes through a dialog (cancel makes no call); appeal is offered only for an appealable decision', async () => {
    mockScenario('checks_running');
    api.withdrawClaim.mockResolvedValue(claimFor('withdrawn'));
    const view = await renderTracker();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    let dialog = await screen.findByRole('dialog', { name: 'Withdraw this claim?' });
    // Destructive: focus starts on Cancel.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.withdrawClaim).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /appeal/i })).not.toBeInTheDocument();

    api.getClaimProgress.mockResolvedValue(progress('withdrawn_after_submit'));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    dialog = await screen.findByRole('dialog', { name: 'Withdraw this claim?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw claim' }));
    await waitFor(() => expect(api.withdrawClaim).toHaveBeenCalledWith(CLAIM_ID));
    expect(toast.success).toHaveBeenCalledWith('Claim withdrawn.', expect.anything());
    await waitFor(() => expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'withdrawn'));
    view.unmount();

    mockScenario('decided_by_reviewer', claimFor('rejected', { assessment: decidedAssessment('rejected') }));
    await renderTracker();
    expect(await screen.findByRole('button', { name: 'Appeal decision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to appeal' })).toBeInTheDocument();
    expect(api.getAppeal).toHaveBeenCalledWith(CLAIM_ID);
  });

  it('TRK-12: a withdrawn claim stops polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockScenario('withdrawn_after_submit', claimFor('withdrawn'));
    await renderTracker();
    const reads = api.getClaimProgress.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
    });
    expect(api.getClaimProgress.mock.calls.length).toBe(reads);
  });

  it('TRK-13: /progress 404 on an older backend falls back to the verification read (legacy view, no satellite card)', async () => {
    api.getClaim.mockResolvedValue(claimFor('submitted'));
    api.getClaimProgress.mockRejectedValue(new ApiClientError(404, 'notFound'));
    api.getClaimVerification.mockResolvedValue({ verification: {}, claim: claimFor('submitted') });
    await renderTracker();
    expect(api.getClaimVerification).toHaveBeenCalledWith(CLAIM_ID, expect.anything());
    expect(stageAttrs()).toEqual([['received', 'complete'], ['decision', 'pending']]);
    expect(screen.queryByTestId('tracker-satellite')).not.toBeInTheDocument();
    expect(screen.getByText(enV2.trackerLegacyNote)).toBeInTheDocument();
    expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'in_progress');
  });

  it('TRK-13: /progress and the verification read both 404 (not this farmer\'s claim): not found, nothing rendered', async () => {
    api.getClaim.mockRejectedValue(new ApiClientError(404, 'notFound'));
    api.getClaimProgress.mockRejectedValue(new ApiClientError(404, 'notFound'));
    api.getClaimVerification.mockRejectedValue(new ApiClientError(404, 'notFound'));
    const onBack = vi.fn();
    render(<ClaimTracker claimId={CLAIM_ID} language="en" onBack={onBack} />);
    expect(await screen.findByText('This claim could not be found.')).toBeInTheDocument();
    expect(screen.queryByTestId('tracker-stage')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Back to my claims' })[1]);
    expect(onBack).toHaveBeenCalled();
  });

  it('TRK-14: evidence counts; a failed refresh shows the error banner and keeps the last progress on screen', async () => {
    mockScenario(
      'checks_running',
      claimFor('submitted', {
        evidence: [
          { uploadId: 'ev1', mediaType: 'image/jpeg', size: 1, width: 1, height: 1, status: 'stored', uploadedAt: '', createdAt: '' },
          { uploadId: 'ev2', mediaType: 'image/jpeg', size: 1, width: 1, height: 1, status: 'stored', uploadedAt: '', createdAt: '' },
        ],
      })
    );
    api.listOwnershipEvidence.mockResolvedValue({ claimId: CLAIM_ID, evidence: [{ id: 'd1', metadata: {}, status: 'PENDING' }], summary: {} });
    await renderTracker();
    await waitFor(() => expect(screen.getByTestId('tracker-evidence-counts')).toHaveTextContent('2 photo(s) · 1 land document(s)'));
    expect(screen.getAllByRole('img', { name: /^Claim photo \d$/ })).toHaveLength(2);

    const before = stageAttrs();
    const lastUpdated = screen.getByTestId('tracker-last-updated').getAttribute('data-last-updated');
    api.getClaimProgress.mockRejectedValue(new ApiClientError(503, 'serviceBusy'));
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByTestId('tracker-refresh-error')).toHaveTextContent('Could not check for updates');
    expect(stageAttrs()).toEqual(before);
    expect(screen.getByTestId('tracker-last-updated')).toHaveAttribute('data-last-updated', lastUpdated!);
  });

  it('TRK-15: a Tamil render shows no English tracker strings and no raw keys', async () => {
    await act(async () => void (await i18n.changeLanguage('ta')));
    const tamilClaim = (state: ClaimState, extra: Partial<LossClaim> = {}) =>
      claimFor(state, { parcelSnapshot: { parcelId: 'par_1', name: 'வடக்கு வயல்', crop: 'நெல்', parcelAreaAcres: 1.25 }, ...extra });
    const englishValues = Object.entries(enV2)
      .filter(([key]) => /^(tracker|progress|action|satellite|decisionReason|evidenceSummary|evidenceLink|claimRule_|approvedArea|overlapWarning)/.test(key))
      .map(([, value]) => value.split('{{')[0].trim())
      .filter((value) => value.length >= 8);
    for (const [name, claim] of [
      ['retrying_event_today', tamilClaim('submitted')],
      ['more_evidence_required', tamilClaim('more_evidence_required', { assessment: decidedAssessment('more_evidence_required') })],
      ['decided_verified', tamilClaim('verified', { assessment: decidedAssessment('verified') })],
    ] as const) {
      mockScenario(name, claim);
      const view = await renderTracker('ta');
      const text = view.container.textContent ?? '';
      for (const english of englishValues) expect(text, `${name}: ${english}`).not.toContain(english);
      expect(text, name).not.toMatch(RAW_KEY);
      for (const english of ['Claim details', 'Check for updates', 'Last update', 'Supporting only', 'Withdraw claim']) {
        expect(text, `${name}: ${english}`).not.toContain(english);
      }
      const letters = text.replace(/[^\p{L}]/gu, '');
      const tamil = letters.replace(/[^஀-௿]/g, '');
      expect(tamil.length / letters.length, name).toBeGreaterThan(0.9);
      view.unmount();
    }
  });

  it('TRK-16: the claim is read again when the backend reports a new state, so the decision renders', async () => {
    api.getClaim.mockResolvedValueOnce(claimFor('processing'));
    api.getClaimProgress.mockResolvedValueOnce(progress('deciding'));
    await renderTracker();
    expect(api.getClaim).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('decision-card')).not.toBeInTheDocument();

    api.getClaim.mockResolvedValue(claimFor('verified', { decidedAt: '2026-10-16T09:04:00.000Z', assessment: decidedAssessment('verified') }));
    api.getClaimProgress.mockResolvedValue(progress('decided_verified'));
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    const card = await screen.findByTestId('decision-card');
    expect(card).toHaveAttribute('data-decision', 'verified');
    await waitFor(() => expect(api.getClaim).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(card).getByTestId('decision-outcome')).toHaveTextContent('Verified'));
    expect(card).toHaveTextContent(enV2.decisionReason_outcome_verified);
    expect(screen.getByTestId('claim-tracker')).toHaveAttribute('data-overall-status', 'decided');
  });
});
