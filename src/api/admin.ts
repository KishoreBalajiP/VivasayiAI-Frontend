// Phase 10 (E9-S10) — Admin + appeal API client. Follows the exact src/api case.ts
// conventions: every call goes through the single envelope client (src/api/client.ts),
// actors come from the Bearer token (identity is NEVER sent in the body), and responses
// unwrap `envelope.data`. Admin routes are additionally gated server-side by the signed
// `role` claim (requireRole('admin')); a farmer calling any of these receives 403 without
// touching the underlying claim.
//
// The farmer appeal endpoints (/claims/:id/appeal) live in the farmer module (src/api/claims.ts)
// and are re-exported below for cohesion with the admin exception workflow.

import { request } from './client';
import { buildAdminQueryString } from '../utils/adminQueue';
import type {
  AdminClaimDetail,
  AdminQueueFilters,
  AdminQueueResponse,
  AdminVerificationDiagnostics,
  DashboardResponse,
  InvestigationResponse,
  OverrideInput,
  OverrideResult,
  RequeueJobsResult,
} from '../types';

// GET /admin/claims — the read-only review queue. Filters are normalized+validated
// server-side (status whitelist, page/limit clamps); the client only sends non-empty ones.
export const listAdminQueue = async (
  input: Partial<AdminQueueFilters> & { page?: number; limit?: number } = {}
): Promise<AdminQueueResponse> => {
  const query = buildAdminQueryString(input);
  const envelope = await request<AdminQueueResponse>(`/admin/claims${query}`);
  return envelope.data;
};

// GET /admin/claims/:claimId — the full read-only review surface for one claim.
export const getAdminClaim = async (claimId: string): Promise<AdminClaimDetail> => {
  const envelope = await request<AdminClaimDetail>(`/admin/claims/${claimId}`);
  return envelope.data;
};

// POST /admin/claims/:claimId/override — the ONLY mutable admin operation. Replay-safe:
// an identical overrideKey returns the recorded result idempotently. The backend records an
// immutable AdminAction + ClaimAudit on every apply; the client can never bypass that.
export const overrideClaim = async (
  claimId: string,
  input: OverrideInput
): Promise<OverrideResult> => {
  const envelope = await request<OverrideResult>(`/admin/claims/${claimId}/override`, {
    method: 'POST',
    body: input,
  });
  return envelope.data;
};

// GET /admin/dashboard — operations metrics computed server-side (never client-derived).
export const getAdminDashboard = async (rangeDays = 90): Promise<DashboardResponse> => {
  const envelope = await request<DashboardResponse>(`/admin/dashboard?rangeDays=${rangeDays}`);
  return envelope.data;
};

// GET /admin/investigation — observation-only fraud signals (never mutates a claim).
export const getInvestigation = async (rangeDays = 90): Promise<InvestigationResponse> => {
  const envelope = await request<InvestigationResponse>(`/admin/investigation?rangeDays=${rangeDays}`);
  return envelope.data;
};

// GET /admin/claims/:claimId/verification-diagnostics — ADR-022 (D9). Read-only: the claim's
// verification jobs (attempts, last error code/kind, timestamps), evidence rows, review cases, the
// audit trail and the farmer's own progress object side by side.
export const getVerificationDiagnostics = async (claimId: string): Promise<AdminVerificationDiagnostics> => {
  const envelope = await request<AdminVerificationDiagnostics>(`/admin/claims/${claimId}/verification-diagnostics`);
  return envelope.data;
};

// POST /admin/claims/:claimId/jobs/requeue — ADR-022 (D9). Re-queues the claim's DEAD jobs after a
// person dealt with the cause; recorded as AdminAction `jobs_requeued` + a ClaimAudit row. Body
// `{ reason (10-2000 chars), steps? }`; 409 unless the claim is `submitted`. A repeat while the new
// jobs are active changes nothing (`idempotent: true`). Not wired into the admin UI yet: the
// diagnostics panel is read-only (plan B7).
export const requeueClaimJobs = async (
  claimId: string,
  input: { reason: string; steps?: string[] }
): Promise<RequeueJobsResult> => {
  const envelope = await request<RequeueJobsResult>(`/admin/claims/${claimId}/jobs/requeue`, {
    method: 'POST',
    body: input,
  });
  return envelope.data;
};

// The farmer appeal calls (POST/GET /claims/:claimId/appeal) are farmer routes, so they live in
// the farmer claims module; re-exported here for existing admin-side imports.
export { submitAppeal, getAppeal } from './claims';