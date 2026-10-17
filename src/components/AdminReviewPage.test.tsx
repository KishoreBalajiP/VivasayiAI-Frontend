// ADM-2..4: the minimal admin changes of plan B7 (owner decisions D8, D9): the "Held" queue filter,
// overriding a held claim, and the read-only verification diagnostics panel.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { progressFor } from '../test/progressFixtures';
import type { AdminClaimDetail, AdminQueueEntry, AdminVerificationDiagnostics } from '../types';

const api = vi.hoisted(() => ({
  listAdminQueue: vi.fn(),
  getAdminClaim: vi.fn(),
  getAdminDashboard: vi.fn(),
  getInvestigation: vi.fn(),
  overrideClaim: vi.fn(),
  getVerificationDiagnostics: vi.fn(),
  requeueClaimJobs: vi.fn(),
}));
vi.mock('../api/admin', () => api);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdminReviewPage } from './AdminReviewPage';

const entry = (overrides: Partial<AdminQueueEntry> = {}): AdminQueueEntry => ({
  id: 'claim_held_1',
  parcelId: 'par_1',
  parcelName: 'North Field',
  crop: 'Rice',
  eventType: 'flood',
  eventDate: '2026-10-10T00:00:00.000Z',
  claimedAreaAcres: 1.1,
  state: 'submitted',
  decidedAt: null,
  createdAt: '2026-10-16T08:50:00.000Z',
  hasAppeal: false,
  appealReason: null,
  appealStatus: null,
  aiFailed: false,
  decisionReason: null,
  held: true,
  ...overrides,
});

const detail = (overrides: Partial<AdminClaimDetail> = {}): AdminClaimDetail =>
  ({
    id: 'claim_held_1',
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
      verification: { status: 'held' },
    },
    farmer: { cognitoSub: 'sub-farmer', email: 'farmer@example.test', name: 'Murugan' },
    parcel: { parcelId: 'par_1', name: 'North Field', crop: 'Rice', calculatedAreaAcres: 1.25, geometry: null },
    evidenceUrls: [],
    appeals: [],
    audit: [],
    adminActions: [],
    meta: { requestedBy: 'sub-admin', requestedAt: '2026-10-16T09:10:00.000Z' },
    ...overrides,
  }) as AdminClaimDetail;

const diagnostics = (): AdminVerificationDiagnostics => ({
  claimId: 'claim_held_1',
  claimState: 'submitted',
  submissionRound: 1,
  firstSubmittedAt: '2026-10-16T09:00:00.000Z',
  submittedAt: '2026-10-16T09:00:00.000Z',
  decidedAt: null,
  policy: { configured: { id: 'v1.1-safe-ai', hash: 'h' }, decidedUnder: null },
  jobs: [
    {
      id: 'job_ai',
      step: 'ai_assessment',
      status: 'dead',
      planKey: 'r1',
      attempts: 7,
      maxAttempts: 7,
      runAt: '2026-10-16T09:00:00.000Z',
      startedAt: '2026-10-16T09:00:05.000Z',
      lastAttemptAt: '2026-10-16T09:20:00.000Z',
      completedAt: null,
      deadAt: '2026-10-16T09:20:01.000Z',
      cancelledAt: null,
      cancelReason: null,
      recoveryRound: 0,
      requeuedAt: null,
      rescheduleCount: 0,
      lastError: { code: 'PROVIDER_QUOTA', kind: 'quota', retryable: true, at: '2026-10-16T09:20:00.000Z' },
      createdAt: '2026-10-16T09:00:00.000Z',
      updatedAt: '2026-10-16T09:20:01.000Z',
    },
    {
      id: 'job_weather',
      step: 'weather',
      status: 'done',
      planKey: 'r1',
      attempts: 1,
      maxAttempts: 5,
      runAt: '2026-10-16T09:00:00.000Z',
      startedAt: '2026-10-16T09:00:05.000Z',
      lastAttemptAt: '2026-10-16T09:00:05.000Z',
      completedAt: '2026-10-16T09:00:06.000Z',
      deadAt: null,
      cancelledAt: null,
      cancelReason: null,
      recoveryRound: 0,
      requeuedAt: null,
      rescheduleCount: 0,
      lastError: null,
      createdAt: '2026-10-16T09:00:00.000Z',
      updatedAt: '2026-10-16T09:00:06.000Z',
    },
  ],
  evidence: [
    { id: 'e1', source: 'WEATHER', component: 'weather', kind: 'evidence', status: 'AVAILABLE', createdAt: '2026-10-16T09:00:06.000Z' },
    { id: 'e2', source: 'AI_IMAGE', component: 'photos', kind: 'review_case', status: 'PENDING', createdAt: '2026-10-16T09:20:01.000Z' },
  ],
  reviewCases: [
    {
      id: 'rv_1',
      status: 'PENDING',
      source: 'AI_IMAGE',
      reasons: ['automated_step_failed_ai_assessment'],
      failedStep: 'ai_assessment',
      failedComponent: 'photos',
      errorCode: 'PROVIDER_QUOTA',
      errorKind: 'quota',
      createdAt: '2026-10-16T09:20:01.000Z',
      resolvedAt: null,
      resolvedDecision: null,
    },
  ],
  audit: [
    {
      actor: 'farmer',
      action: 'submitted',
      fromState: 'draft',
      toState: 'submitted',
      reason: '',
      metadata: {},
      requestId: null,
      createdAt: '2026-10-16T09:00:00.000Z',
    },
  ],
  adminActions: [],
  progress: progressFor('held_technical_reviewer', { claimId: 'claim_held_1' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getAdminDashboard.mockResolvedValue({
    rangeDays: 90,
    metrics: {
      total: 1,
      verified: 0,
      partiallyVerified: 0,
      rejected: 0,
      outOfLimit: 0,
      duplicate: 0,
      moreEvidence: 0,
      pendingHumanReview: 1,
      appealCount: 0,
      aiUncertaintyRate: null,
      averageVerificationTimeMs: null,
    },
  });
  api.listAdminQueue.mockResolvedValue({ items: [entry()], total: 1, page: 1, limit: 20, filters: {} });
  api.getAdminClaim.mockResolvedValue(detail());
  api.getVerificationDiagnostics.mockResolvedValue(diagnostics());
});

const openQueue = async () => {
  render(<AdminReviewPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Review queue' }));
  await screen.findByRole('table');
};

const openHeldClaim = async () => {
  await openQueue();
  await userEvent.click(screen.getByText('North Field'));
  await screen.findByText('Back to queue');
};

describe('AdminReviewPage — held claims and diagnostics', () => {
  it('ADM-2: the Held filter asks the queue for ?held=true and held rows carry a Held signal', async () => {
    await openQueue();
    const row = screen.getByRole('table').querySelector('tbody tr')!;
    expect(within(row as HTMLElement).getByTestId('queue-held-signal')).toHaveTextContent('Held');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Held claims' }), 'true');
    await waitFor(() => expect(api.listAdminQueue).toHaveBeenLastCalledWith(expect.objectContaining({ held: 'true', page: 1 })));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Held claims' }), 'false');
    await waitFor(() => expect(api.listAdminQueue).toHaveBeenLastCalledWith(expect.objectContaining({ held: 'false' })));
  });

  it('ADM-3: the diagnostics panel is read-only and shows jobs (step, status, attempts, last error code/kind, times), review cases, evidence and the audit trail', async () => {
    await openHeldClaim();
    const panel = await screen.findByTestId('admin-verification-diagnostics');
    expect(api.getVerificationDiagnostics).toHaveBeenCalledWith('claim_held_1');
    await waitFor(() => expect(within(panel).getAllByTestId('diag-job')).toHaveLength(2));
    expect(within(panel).getByText('Read-only')).toBeInTheDocument();

    const [aiJob, weatherJob] = within(panel).getAllByTestId('diag-job');
    expect(aiJob).toHaveAttribute('data-step', 'ai_assessment');
    expect(aiJob).toHaveAttribute('data-status', 'dead');
    expect(aiJob).toHaveTextContent('7 of 7');
    expect(aiJob).toHaveTextContent('PROVIDER_QUOTA · quota');
    expect(aiJob).toHaveTextContent('Gave up');
    expect(weatherJob).toHaveTextContent('1 of 5');
    expect(weatherJob).toHaveTextContent('None');
    expect(weatherJob).toHaveTextContent('Completed');

    const reviewCase = within(panel).getByTestId('diag-review-case');
    expect(reviewCase).toHaveTextContent('PENDING');
    expect(reviewCase).toHaveTextContent('automated_step_failed_ai_assessment');
    expect(reviewCase).toHaveTextContent('ai_assessment / PROVIDER_QUOTA / quota');
    // Evidence rows exclude review cases (they are listed above).
    expect(within(panel).getAllByTestId('diag-evidence').map((el) => el.textContent)).toEqual([expect.stringContaining('WEATHER')]);
    expect(within(panel).getByTestId('diag-audit')).toHaveTextContent('draft → submitted');
    expect(within(panel).getByTestId('diag-farmer-status')).toHaveTextContent('Farmer sees: Waiting for a reviewer');
    expect(within(panel).getByText('Policy: v1.1-safe-ai')).toBeInTheDocument();

    // Read-only: nothing in the panel can change anything.
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(api.requeueClaimJobs).not.toHaveBeenCalled();
  });

  it('ADM-4: a held claim offers the override (with a note why); the dialog accepts a decision for it', async () => {
    api.overrideClaim.mockResolvedValue({ claim: {}, adminAction: {}, resolvedAppeals: [], idempotent: false });
    await openHeldClaim();
    expect(await screen.findByTestId('admin-held-note')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Override decision' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New decision' }), 'verified');
    await userEvent.type(screen.getByRole('textbox', { name: i18n.t('adminOverrideReason') }), 'Photos reviewed by hand: the flood damage is clear.');
    const apply = screen.getByRole('button', { name: 'Apply override' });
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    await waitFor(() =>
      expect(api.overrideClaim).toHaveBeenCalledWith('claim_held_1', expect.objectContaining({ toState: 'verified' }))
    );
  });

  it('ADM-4: a submitted claim that is NOT held offers no override', async () => {
    api.getAdminClaim.mockResolvedValue(detail({ assessment: null }));
    await openHeldClaim();
    await screen.findByTestId('admin-verification-diagnostics');
    expect(screen.queryByRole('button', { name: 'Override decision' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-held-note')).not.toBeInTheDocument();
  });
});
