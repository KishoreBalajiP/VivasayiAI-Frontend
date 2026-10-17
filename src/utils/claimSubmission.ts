// Claim submission orchestrator (plan B3, design §8.3). No React and no network of its own: every
// call comes in through `deps`, and every state change goes out as a wizard reducer action, so the
// whole sequence is unit-testable in node.
//
//   1. create     skipped when the draft already has a claimId; otherwise POST /claims with the
//                 draft's stable idempotencyKey (a lost answer + retry returns the same claim)
//   2. photos     one at a time; photos already uploaded are skipped
//   3. documents  one at a time; upload then attach. A document that already has an uploadId is
//                 only attached again (the bytes are never uploaded twice)
//   4. stop       if any photo or document failed, stop BEFORE submit: the claim stays a backend
//                 draft and the farmer retries from where it stopped
//   5. submit     POST /claims/:id/submit with x-request-id fe_<key>_s<attempt>; one automatic
//                 retry after 1.5 s on a 503 ("saved but checks could not be scheduled") or a
//                 network error. Submit is idempotent on the backend.
//
// A 401 anywhere ends the run with `authExpired` (the auth layer then routes to sign-in; the
// draft is kept). Nothing here navigates: the caller decides what success and failure look like.

import { ApiClientError, friendlyMessageKey } from '../api/client';
import {
  MIN_PHOTOS_TO_SUBMIT,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  wizardReducer,
  type ClaimDraft,
  type WizardNavigation,
} from './claimFlow';
import type {
  ClaimCreateInput,
  ClaimEvidenceEntry,
  LossClaim,
  OwnershipDocumentCategory,
  OwnershipEvidence,
  UploadResult,
} from '../types';

export type SubmissionPhase = 'create' | 'photos' | 'documents' | 'submit';

export interface SubmitClaimOptions {
  requestId: string;
}

export interface SubmissionDeps {
  createClaim: (input: ClaimCreateInput) => Promise<LossClaim>;
  uploadPhoto: (claimId: string, file: File) => Promise<ClaimEvidenceEntry>;
  /** /upload presign → PUT → complete (api.ts uploadImage). */
  uploadDocumentFile?: (file: File) => Promise<UploadResult>;
  attachDocument?: (
    claimId: string,
    input: { uploadId: string; documentCategory?: OwnershipDocumentCategory }
  ) => Promise<OwnershipEvidence>;
  submitClaim: (claimId: string, options: SubmitClaimOptions) => Promise<LossClaim>;
  wait?: (ms: number) => Promise<void>;
}

export type SubmissionResult =
  | { ok: true; claim: LossClaim; submitAttempts: number }
  | {
      ok: false;
      phase: SubmissionPhase;
      claimId: string | null;
      /** HTTP status of the failure; 0 = network, -1 = not an HTTP error. */
      status: number;
      errorKey: string;
      failedKeys: string[];
      submitAttempts: number;
      authExpired?: true;
    };

export type SubmissionFailure = Extract<SubmissionResult, { ok: false }>;

export interface RunSubmissionOptions {
  draft: ClaimDraft;
  getFile: (key: string) => File | undefined;
  deps: SubmissionDeps;
  /** Receives every reducer action the run applies, in order. */
  dispatch: (action: WizardNavigation) => void;
  onPhase?: (phase: SubmissionPhase) => void;
  /** Submit attempts already used by earlier runs of this draft (numbers the x-request-id). */
  previousSubmitAttempts?: number;
}

export const SUBMIT_RETRY_DELAY_MS = 1500;

const REQUEST_ID_MAX = 64; // backend requestLogger: /^[A-Za-z0-9._-]{8,64}$/

/** x-request-id for a submit attempt: fe_<idempotencyKey>_s<attempt>, cut to the backend limit. */
export const submissionRequestId = (idempotencyKey: string, attempt: number): string => {
  const suffix = `_s${Math.max(1, Math.floor(attempt))}`;
  const safeKey = idempotencyKey.replace(/[^A-Za-z0-9_-]/g, '');
  return `fe_${safeKey.slice(0, REQUEST_ID_MAX - 3 - suffix.length)}${suffix}`;
};

export const errorStatus = (error: unknown): number => {
  if (error instanceof ApiClientError) return error.status;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : -1;
};

/**
 * The message for a failed run, worded by phase and status (design §8.4). `uploadLimiter` is the
 * /upload limiter (per MINUTE, documents); claim writes and evidence have hourly limiters.
 */
export const submissionErrorKey = (
  phase: SubmissionPhase,
  status: number,
  detail: { documentStep?: 'upload' | 'attach'; missingFile?: boolean } = {}
): string => {
  if (detail.missingFile) return 'submitError_missing_files';
  switch (status) {
    case 401:
      return 'authExpired';
    case 429:
      if (phase === 'create' || phase === 'submit') return 'submitError_rate_claims';
      if (phase === 'documents' && detail.documentStep === 'upload') return 'submitError_rate_upload';
      return 'submitError_rate_evidence';
    case 503:
      return phase === 'submit' ? 'submitError_submit_unavailable' : 'submitError_unavailable';
    case 0:
      return 'submitError_network';
    case 404:
    case 409:
      return 'submitError_conflict';
    case 400:
    case 413:
    case 415:
    case 422:
      return phase === 'photos' || phase === 'documents' ? 'submitError_items_failed' : 'submitError_bad_request';
    default:
      // A single photo or document failing (bad bytes, server error) is fixed per item.
      return phase === 'photos' || phase === 'documents' ? 'submitError_items_failed' : 'submitError_generic';
  }
};

// Statuses after which the rest of the batch is not attempted: it would fail the same way and
// spend rate-limit budget (429), or there is no connection (0), or the session is gone (401).
const STOPS_BATCH = new Set([0, 401, 429]);

const itemErrorKey = (status: number): string =>
  status === -1 ? 'imageUploadFailed' : friendlyMessageKey(status, 'image');

export const buildClaimCreateInput = (draft: ClaimDraft): ClaimCreateInput | null => {
  if (!draft.parcelId || !draft.eventType || !draft.eventDate || !draft.geometry || !draft.idempotencyKey) {
    return null;
  }
  const input: ClaimCreateInput = {
    parcelId: draft.parcelId,
    eventType: draft.eventType,
    eventDate: draft.eventDate,
    // The farmer's real selection; never replaced by the parcel boundary here.
    geometry: draft.geometry,
    idempotencyKey: draft.idempotencyKey,
  };
  // Optional: only sent when the farmer answered (the backend stores null otherwise).
  if (draft.claimantRelationship) input.claimantRelationship = draft.claimantRelationship;
  return input;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ItemOutcome {
  ok: boolean;
  status: number;
  documentStep?: 'upload' | 'attach';
  missingFile?: boolean;
}

interface RunContext {
  current: ClaimDraft;
  apply: (action: WizardNavigation) => void;
  getFile: (key: string) => File | undefined;
  deps: SubmissionDeps;
}

const makeContext = (options: Pick<RunSubmissionOptions, 'draft' | 'getFile' | 'deps' | 'dispatch'>): RunContext => {
  const ctx: RunContext = {
    current: options.draft,
    apply: (action) => {
      ctx.current = wizardReducer(ctx.current, action);
      options.dispatch(action);
    },
    getFile: options.getFile,
    deps: options.deps,
  };
  return ctx;
};

const uploadPhotoItem = async (ctx: RunContext, claimId: string, key: string): Promise<ItemOutcome> => {
  const entry = ctx.current.evidence.find((e) => e.key === key);
  if (!entry || entry.status === 'uploaded') return { ok: true, status: 200 };
  const file = ctx.getFile(key);
  if (!file) {
    ctx.apply({ type: 'evidence.failed', key, errorKey: 'wizardFileMissing' });
    return { ok: false, status: -1, missingFile: true };
  }
  ctx.apply({ type: 'evidence.uploading', key });
  try {
    const stored = await ctx.deps.uploadPhoto(claimId, file);
    ctx.apply({ type: 'evidence.uploaded', key, uploadId: stored?.uploadId ?? 'stored' });
    return { ok: true, status: 200 };
  } catch (error) {
    const status = errorStatus(error);
    ctx.apply({ type: 'evidence.failed', key, errorKey: status === 401 ? 'authExpired' : itemErrorKey(status) });
    return { ok: false, status };
  }
};

const uploadDocumentItem = async (ctx: RunContext, claimId: string, key: string): Promise<ItemOutcome> => {
  const doc = ctx.current.documents.find((d) => d.key === key);
  if (!doc || doc.status === 'attached') return { ok: true, status: 200 };
  let uploadId = doc.uploadId;
  if (!uploadId) {
    const file = ctx.getFile(key);
    if (!file) {
      ctx.apply({ type: 'document.failed', key, errorKey: 'wizardFileMissing', failedPhase: 'upload' });
      return { ok: false, status: -1, documentStep: 'upload', missingFile: true };
    }
    if (!ctx.deps.uploadDocumentFile) {
      ctx.apply({ type: 'document.failed', key, errorKey: 'imageUploadFailed', failedPhase: 'upload' });
      return { ok: false, status: -1, documentStep: 'upload' };
    }
    ctx.apply({ type: 'document.uploading', key });
    try {
      const stored = await ctx.deps.uploadDocumentFile(file);
      uploadId = stored.uploadId;
      ctx.apply({ type: 'document.uploaded', key, uploadId });
    } catch (error) {
      const status = errorStatus(error);
      ctx.apply({ type: 'document.failed', key, errorKey: status === 401 ? 'authExpired' : itemErrorKey(status), failedPhase: 'upload' });
      return { ok: false, status, documentStep: 'upload' };
    }
  }
  if (!ctx.deps.attachDocument) {
    ctx.apply({ type: 'document.failed', key, errorKey: 'imageUploadFailed', failedPhase: 'attach' });
    return { ok: false, status: -1, documentStep: 'attach' };
  }
  ctx.apply({ type: 'document.attaching', key });
  try {
    const category = ctx.current.documents.find((d) => d.key === key)?.category ?? doc.category;
    const evidence = await ctx.deps.attachDocument(claimId, { uploadId, documentCategory: category });
    ctx.apply({ type: 'document.attached', key, evidenceId: evidence?.id ?? uploadId });
    return { ok: true, status: 200 };
  } catch (error) {
    const status = errorStatus(error);
    ctx.apply({
      type: 'document.failed',
      key,
      errorKey: status === 401 ? 'authExpired' : friendlyMessageKey(status === -1 ? 500 : status),
      failedPhase: 'attach',
    });
    return { ok: false, status, documentStep: 'attach' };
  }
};

const failure = (
  ctx: RunContext,
  phase: SubmissionPhase,
  outcome: ItemOutcome,
  failedKeys: string[],
  submitAttempts: number
): SubmissionFailure => ({
  ok: false,
  phase,
  claimId: ctx.current.claimId,
  status: outcome.status,
  errorKey: submissionErrorKey(phase, outcome.status, outcome),
  failedKeys,
  submitAttempts,
  ...(outcome.status === 401 ? { authExpired: true as const } : {}),
});

/**
 * Upload (or re-upload) ONE photo or document against an existing claim — the per-item Retry on
 * the Evidence step. Same transitions as the full run; never creates or submits.
 */
export const retrySubmissionItem = async (
  options: Pick<RunSubmissionOptions, 'draft' | 'getFile' | 'deps' | 'dispatch'> & {
    kind: 'photo' | 'document';
    key: string;
  }
): Promise<{ ok: boolean; status: number; authExpired?: true }> => {
  const claimId = options.draft.claimId;
  if (!claimId) return { ok: false, status: -1 };
  const ctx = makeContext(options);
  const outcome =
    options.kind === 'photo'
      ? await uploadPhotoItem(ctx, claimId, options.key)
      : await uploadDocumentItem(ctx, claimId, options.key);
  return { ok: outcome.ok, status: outcome.status, ...(outcome.status === 401 ? { authExpired: true as const } : {}) };
};

export const runClaimSubmission = async (options: RunSubmissionOptions): Promise<SubmissionResult> => {
  const ctx = makeContext(options);
  const wait = options.deps.wait ?? defaultWait;
  let submitAttempts = 0;

  // The key must be stable from the first create on; a draft without a valid one gets one now and
  // keeps it for every retry.
  if (!ctx.current.idempotencyKey || !isValidIdempotencyKey(ctx.current.idempotencyKey)) {
    ctx.apply({ type: 'idempotency.set', key: generateIdempotencyKey() });
  }

  // 1. create
  let claimId = ctx.current.claimId;
  if (!claimId) {
    options.onPhase?.('create');
    const input = buildClaimCreateInput(ctx.current);
    if (!input) return failure(ctx, 'create', { ok: false, status: 400 }, [], submitAttempts);
    try {
      const claim = await options.deps.createClaim(input);
      claimId = claim.id;
      ctx.apply({ type: 'claim.created', claimId });
    } catch (error) {
      return failure(ctx, 'create', { ok: false, status: errorStatus(error) }, [], submitAttempts);
    }
  }

  // 2. photos, then 3. documents. The first failure decides the reported phase and status.
  let firstFailure: { phase: SubmissionPhase; outcome: ItemOutcome } | null = null;
  const failedKeys: string[] = [];
  let stopped = false;

  const pendingPhotos = ctx.current.evidence.filter((e) => e.status !== 'uploaded').map((e) => e.key);
  if (pendingPhotos.length > 0) options.onPhase?.('photos');
  for (const key of pendingPhotos) {
    const outcome = await uploadPhotoItem(ctx, claimId, key);
    if (outcome.ok) continue;
    failedKeys.push(key);
    if (!firstFailure) firstFailure = { phase: 'photos', outcome };
    if (STOPS_BATCH.has(outcome.status)) {
      stopped = true;
      break;
    }
  }

  if (!stopped) {
    const pendingDocuments = ctx.current.documents.filter((d) => d.status !== 'attached').map((d) => d.key);
    if (pendingDocuments.length > 0) options.onPhase?.('documents');
    for (const key of pendingDocuments) {
      const outcome = await uploadDocumentItem(ctx, claimId, key);
      if (outcome.ok) continue;
      failedKeys.push(key);
      if (!firstFailure) firstFailure = { phase: 'documents', outcome };
      if (STOPS_BATCH.has(outcome.status)) break;
    }
  }

  // 4. stop before submit: nothing is submitted with a photo or document missing.
  if (firstFailure) return failure(ctx, firstFailure.phase, firstFailure.outcome, failedKeys, submitAttempts);

  const uploadedPhotos = ctx.current.evidence.filter((e) => e.status === 'uploaded').length;
  if (uploadedPhotos < MIN_PHOTOS_TO_SUBMIT) {
    return { ...failure(ctx, 'photos', { ok: false, status: 400 }, [], submitAttempts), errorKey: 'reviewReason_no_photos' };
  }

  // 5. submit, with one automatic retry on 503 / network.
  options.onPhase?.('submit');
  const idempotencyKey = ctx.current.idempotencyKey as string;
  const base = options.previousSubmitAttempts ?? 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    submitAttempts = attempt;
    try {
      const claim = await options.deps.submitClaim(claimId, {
        requestId: submissionRequestId(idempotencyKey, base + attempt),
      });
      // Never report success over a claim the backend left in draft (or moved to withdrawn).
      if (!claim || claim.state === 'draft' || claim.state === 'withdrawn') {
        return failure(ctx, 'submit', { ok: false, status: 409 }, [], submitAttempts);
      }
      return { ok: true, claim, submitAttempts };
    } catch (error) {
      const status = errorStatus(error);
      const retryable = status === 503 || status === 0;
      if (retryable && attempt === 1) {
        await wait(SUBMIT_RETRY_DELAY_MS);
        continue;
      }
      return failure(ctx, 'submit', { ok: false, status }, [], submitAttempts);
    }
  }
  // Unreachable: the loop above always returns.
  return failure(ctx, 'submit', { ok: false, status: -1 }, [], submitAttempts);
};
