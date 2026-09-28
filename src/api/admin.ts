// Phase 10 (E9-S10) — Admin + appeal API client. Follows the exact src/api case.ts
// conventions: every call goes through the single envelope client (src/api/client.ts),
// actors come from the Bearer token (identity is NEVER sent in the body), and responses
// unwrap `envelope.data`. Admin routes are additionally gated server-side by the signed
// `role` claim (requireRole('admin')); a farmer calling any of these receives 403 without
// touching the underlying claim.
//
// The farmer appeal endpoints (/claims/:id/appeal) are included here for cohesion with the
// admin exception workflow — the same claim the farmer appeals is the claim an admin reviews.

import { request } from './client';
import { buildAdminQueryString } from '../utils/adminQueue';
import type {
  AdminClaimDetail,
  AdminQueueFilters,
  AdminQueueResponse,
  Appeal,
  AppealInput,
  DashboardResponse,
  InvestigationResponse,
  OverrideInput,
  OverrideResult,
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

// POST /claims/:claimId/appeal — farmer submits an appeal on an appealable engine decision.
export const submitAppeal = async (claimId: string, input: AppealInput): Promise<Appeal> => {
  const envelope = await request<{ appeal: Appeal }>(`/claims/${claimId}/appeal`, {
    method: 'POST',
    body: input,
  });
  return envelope.data.appeal;
};

// GET /claims/:claimId/appeal — the caller's appeal for the claim (404 when none / foreign).
export const getAppeal = async (claimId: string): Promise<Appeal | null> => {
  const envelope = await request<{ appeal: Appeal }>(`/claims/${claimId}/appeal`);
  return envelope.data?.appeal ?? null;
};