// Claim feature API client (Phase 7 — Farmer Claims Frontend). One per claim domain, following
// the exact src/api.ts conventions: every call goes through the single envelope client
// (src/api/client.ts), ownership comes from the Bearer token (identity is NEVER sent), and
// responses unwrap `envelope.data`. The affected-area geometry sent on create is the selected
// parcel's real stored geometry — the backend recomputes the authoritative area from it.
//
// Evidence uploads reuse the presigned-S3 transport that /upload uses: presign → direct S3 PUT
// (no Authorization header — the URL is the credential) → complete. Evidence is claim-scoped
// (POST /claims/:claimId/evidence/...) and the browser never receives S3 keys, only scoped
// uploadIds and signed URLs.

import { ApiClientError, friendlyMessageKey, request } from './client';
import { detectImageType } from '../utils/imageValidation';
import type {
  ClaimAssessment,
  ClaimCreateInput,
  ClaimEvidenceEntry,
  EvidenceDeleteResult,
  EvidencePresign,
  EvidenceSignedUrl,
  LossClaim,
  ParcelRecord,
  VerificationDecision,
  VerificationRules,
} from '../types';

// Exact content types the backend accepts for claim evidence (claimEvidence.service.js).
const TYPE_TO_CONTENT_TYPE: Record<'jpeg' | 'png' | 'webp', string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// Direct S3 PUTs need generous time on slow uplinks (same policy as src/api.ts).
const DIRECT_PUT_TIMEOUT_MS = 120000;

// ── /claims lifecycle ────────────────────────────────────────────────────────────────────

// GET /claims — the caller's claims, newest-first (assessment: null in the list view).
export const listClaims = async (): Promise<LossClaim[]> => {
  const envelope = await request<{ claims: LossClaim[] }>('/claims');
  return envelope.data?.claims ?? [];
};

// POST /claims — create a DRAFT claim. Idempotent via the owner-scoped idempotencyKey: a
// dropped response retried with the same key returns the existing claim (idempotent).
export const createClaim = async (input: ClaimCreateInput): Promise<LossClaim> => {
  const envelope = await request<{ claim: LossClaim }>('/claims', { method: 'POST', body: input });
  return envelope.data.claim;
};

// GET /claims/:claimId — the caller's claim (foreign/unowned → 404). Includes `assessment`.
export const getClaim = async (claimId: string): Promise<LossClaim> => {
  const envelope = await request<{ claim: LossClaim }>(`/claims/${claimId}`);
  return envelope.data.claim;
};

// POST /claims/:claimId/submit — draft → submitted (backend state machine; idempotent).
export const submitClaim = async (claimId: string): Promise<LossClaim> => {
  const envelope = await request<{ claim: LossClaim }>(`/claims/${claimId}/submit`, {
    method: 'POST',
  });
  return envelope.data.claim;
};

// POST /claims/:claimId/withdraw — draft|submitted → withdrawn (terminal).
export const withdrawClaim = async (claimId: string): Promise<LossClaim> => {
  const envelope = await request<{ claim: LossClaim }>(`/claims/${claimId}/withdraw`, {
    method: 'POST',
  });
  return envelope.data.claim;
};

// POST /claims/:claimId/resubmit — more_evidence_required → submitted (the ONLY legal resubmit).
export const resubmitClaim = async (claimId: string): Promise<LossClaim> => {
  const envelope = await request<{ claim: LossClaim }>(`/claims/${claimId}/resubmit`, {
    method: 'POST',
  });
  return envelope.data.claim;
};

// POST /claims/:claimId/verify — requests the backend's deterministic verification. NO body is
// sent: any client-supplied result/state/area/AI payload is structurally ignored by the server.
export const verifyClaimRequest = async (claimId: string): Promise<VerificationDecision> => {
  const envelope = await request<{ verification: VerificationDecision }>(
    `/claims/${claimId}/verify`,
    { method: 'POST' }
  );
  return envelope.data.verification;
};

// ── /profile/parcels (the wizard's source of selectable farm parcels) ─────────────────────

// GET /profile/parcels — the caller's parcels with authoritative calculatedAreaAcres.
export const listParcels = async (): Promise<ParcelRecord[]> => {
  const envelope = await request<{ parcels: ParcelRecord[] }>('/profile/parcels');
  return envelope.data?.parcels ?? [];
};

// ── Claim evidence (presigned S3 transport, claim-scoped) ────────────────────────────────

// POST /claims/:claimId/evidence/presign — body { contentType, size, filename }.
export const presignEvidence = async (
  claimId: string,
  input: { contentType: string; size: number; filename: string }
): Promise<EvidencePresign> => {
  const envelope = await request<EvidencePresign>(`/claims/${claimId}/evidence/presign`, {
    method: 'POST',
    body: input,
  });
  return envelope.data;
};

// POST /claims/:claimId/evidence/:evidenceId/complete — re-validates the S3 object and stores
// the evidence (atomic + idempotent; returns the stored metadata).
export const completeEvidenceUpload = async (
  claimId: string,
  evidenceId: string
): Promise<ClaimEvidenceEntry> => {
  const envelope = await request<{ evidence: ClaimEvidenceEntry }>(
    `/claims/${claimId}/evidence/${evidenceId}/complete`,
    { method: 'POST' }
  );
  return envelope.data.evidence;
};

// DELETE /claims/:claimId/evidence/:evidenceId — removes an owned evidence (mutable states only).
export const deleteEvidenceUpload = async (
  claimId: string,
  evidenceId: string
): Promise<EvidenceDeleteResult> => {
  const envelope = await request<EvidenceDeleteResult>(
    `/claims/${claimId}/evidence/${evidenceId}`,
    { method: 'DELETE' }
  );
  return envelope.data;
};

// GET /claims/:claimId/evidence/:evidenceId/url — short-lived signed GET url for display.
export const getEvidenceUrl = async (
  claimId: string,
  evidenceId: string
): Promise<EvidenceSignedUrl> => {
  const envelope = await request<EvidenceSignedUrl>(
    `/claims/${claimId}/evidence/${evidenceId}/url`
  );
  return envelope.data;
};

// Direct S3 PUT with the EXACT Content-Type declared at presign time. No Authorization header
// (the URL itself is the credential). Mirrors src/api.ts putFileToPresignedUrl.
const putFileToPresignedUrl = async (
  uploadUrl: string,
  file: File,
  contentType: string
): Promise<void> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIRECT_PUT_TIMEOUT_MS);
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiClientError(res.status, friendlyMessageKey(res.status));
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(0, friendlyMessageKey(0));
  } finally {
    clearTimeout(timeoutId);
  }
};

// Open the File, sniff the magic bytes and return the exact type the backend knows. Returns
// null when neither the sniffed bytes nor the browser MIME identify an image.
export const evidenceContentType = async (file: File): Promise<string | null> => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = detectImageType(bytes);
  if (sniffed) return TYPE_TO_CONTENT_TYPE[sniffed];
  const browserType = (file.type || '').toLowerCase();
  if (browserType.startsWith('image/')) return browserType;
  return null;
};

// Full claim-evidence upload flow (presign → PUT → complete). Callers branch on the resulting
// Catcher-friendly error like the chat composer does (friendlyMessageKey status).
export const uploadClaimEvidence = async (
  claimId: string,
  file: File
): Promise<ClaimEvidenceEntry> => {
  const contentType = await evidenceContentType(file);
  if (!contentType) throw new ApiClientError(400, friendlyMessageKey(400));

  const presign = await presignEvidence(claimId, {
    contentType,
    size: file.size,
    filename: file.name,
  });

  await putFileToPresignedUrl(presign.uploadUrl, file, contentType);

  return completeEvidenceUpload(claimId, presign.uploadId);
};

// Re-exports so callers can type rule reports (backend engine output) without importing deep
// backend-only types.
export type { VerificationRules, ClaimAssessment };