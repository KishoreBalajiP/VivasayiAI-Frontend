// Claim-wizard draft persistence (plan B3, design §8.5). Pure apart from the storage it is given.
//
//   key      vivasayi.claimDraft.v1:<cognitoSub || email>   (sessionStorage: the tab, not the disk)
//   value    { v: 1, savedAt, draft }                        (no File objects, only metadata)
//   expiry   24 h after savedAt
//
// A restored draft cannot bring its files back (a File cannot be stored), so every photo or
// document that had not reached the server is marked `missing_file` and must be chosen again.
// Logout removes every key with this prefix (AuthContext clearClaimDrafts); a 401 does not, so the
// same farmer can sign back in and continue.

import { config } from '../config';
import {
  CLAIMANT_RELATIONSHIP_SET,
  CLAIM_DOCUMENT_MAX,
  CLAIM_EVENT_TYPE_SET,
  CLAIM_EVIDENCE_MAX,
  CLAIM_WIZARD_STEPS,
  OWNERSHIP_DOCUMENT_CATEGORIES,
  furthestValidStepIndex,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  validateClaimDate,
  type ClaimDraft,
  type ClaimWizardStep,
  type StagedDocument,
  type StagedEvidence,
} from './claimFlow';
import type { ClaimantRelationship, GeoJsonPolygon, LossEventType, OwnershipDocumentCategory } from '../types';

export const CLAIM_DRAFT_KEY_PREFIX = 'vivasayi.claimDraft.';
export const CLAIM_DRAFT_VERSION = 1;
export const CLAIM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const CLAIM_DRAFT_SAVE_DEBOUNCE_MS = 300;

// Same key AuthContext writes the signed-in user under (USER_STORAGE_KEY). Built from config
// rather than imported so this module stays free of React.
const AUTH_USER_STORAGE_KEY = `${config.auth.storageKeyPrefix}:user`;

export interface StoredClaimDraft {
  v: number;
  savedAt: number;
  draft: ClaimDraft;
}

export interface DraftStorageOptions {
  storage?: Storage | null;
  now?: number;
}

export interface RestoredClaimDraft {
  draft: ClaimDraft;
  savedAt: number;
  /** Photos and documents that must be chosen again. */
  missingCount: number;
  /** The saved event date no longer passes the 30-day check. */
  dateInvalid: boolean;
}

/** Per-user storage key; null when no user is known (nothing is then persisted). */
export const claimDraftStorageKey = (owner: string | null | undefined): string | null => {
  const trimmed = typeof owner === 'string' ? owner.trim() : '';
  return trimmed ? `${CLAIM_DRAFT_KEY_PREFIX}v${CLAIM_DRAFT_VERSION}:${trimmed}` : null;
};

export const draftOwnerFromUser = (
  user: { cognitoSub?: string | null; email?: string | null } | null | undefined
): string | null => user?.cognitoSub || user?.email || null;

const defaultStorage = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // storage blocked (privacy mode): the wizard simply does not persist
  }
};

const resolveStorage = (options: DraftStorageOptions): Storage | null =>
  options.storage === undefined ? defaultStorage() : options.storage;

/** The signed-in user's draft owner id, read from the auth session (null when signed out). */
export const readStoredDraftOwner = (storage: Storage | null = defaultStorage()): string | null => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cognitoSub?: string; email?: string } | null;
    return draftOwnerFromUser(parsed);
  } catch {
    return null;
  }
};

// Something the farmer actually entered. The parcel alone is not enough: a farmer with one parcel
// gets it selected automatically, and that should not greet them with "we restored your draft".
export const isDraftWorthSaving = (draft: ClaimDraft): boolean =>
  Boolean(
    draft.claimId ||
      draft.claimantRelationship ||
      draft.eventType ||
      draft.eventDate ||
      draft.evidence.length > 0 ||
      draft.documents.length > 0
  );

// Only plain, known fields are written, so a File (or anything else) that ends up on an entry
// can never be serialised.
const plainEvidence = (e: StagedEvidence): StagedEvidence => ({
  key: e.key,
  name: e.name,
  size: e.size,
  detectedType: e.detectedType,
  status: e.status,
  ...(e.uploadId ? { uploadId: e.uploadId } : {}),
  ...(e.errorKey ? { errorKey: e.errorKey } : {}),
});

const plainDocument = (d: StagedDocument): StagedDocument => ({
  key: d.key,
  name: d.name,
  size: d.size,
  detectedType: d.detectedType,
  category: d.category,
  status: d.status,
  ...(d.uploadId ? { uploadId: d.uploadId } : {}),
  ...(d.evidenceId ? { evidenceId: d.evidenceId } : {}),
  ...(d.errorKey ? { errorKey: d.errorKey } : {}),
  ...(d.failedPhase ? { failedPhase: d.failedPhase } : {}),
});

export const serializeClaimDraft = (draft: ClaimDraft, savedAt: number): string => {
  const record: StoredClaimDraft = {
    v: CLAIM_DRAFT_VERSION,
    savedAt,
    draft: {
      step: draft.step,
      reachedStep: draft.reachedStep,
      parcelId: draft.parcelId,
      claimantRelationship: draft.claimantRelationship,
      eventType: draft.eventType,
      eventDate: draft.eventDate,
      geometry: draft.geometry,
      idempotencyKey: draft.idempotencyKey,
      evidence: draft.evidence.map(plainEvidence),
      documents: draft.documents.map(plainDocument),
      claimId: draft.claimId,
    },
  };
  return JSON.stringify(record);
};

export const saveClaimDraft = (
  owner: string | null | undefined,
  draft: ClaimDraft,
  options: DraftStorageOptions = {}
): boolean => {
  const key = claimDraftStorageKey(owner);
  const storage = resolveStorage(options);
  if (!key || !storage) return false;
  try {
    storage.setItem(key, serializeClaimDraft(draft, options.now ?? Date.now()));
    return true;
  } catch {
    return false; // quota or blocked storage: the draft lives in memory only
  }
};

export const clearClaimDraft = (owner: string | null | undefined, options: DraftStorageOptions = {}): void => {
  const key = claimDraftStorageKey(owner);
  const storage = resolveStorage(options);
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
};

// ── Restore: validate every field (the stored JSON is untrusted), then mark lost files ─────────

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const IMAGE_TYPES = new Set(['jpeg', 'png', 'webp']);
const asImageType = (value: unknown): StagedEvidence['detectedType'] =>
  typeof value === 'string' && IMAGE_TYPES.has(value) ? (value as 'jpeg' | 'png' | 'webp') : null;

const asStep = (value: unknown): ClaimWizardStep | null =>
  typeof value === 'string' && (CLAIM_WIZARD_STEPS as string[]).includes(value) ? (value as ClaimWizardStep) : null;

const asPolygon = (value: unknown): GeoJsonPolygon | null =>
  isObject(value) && value.type === 'Polygon' && Array.isArray(value.coordinates)
    ? (value as unknown as GeoJsonPolygon)
    : null;

const EVIDENCE_STATUSES = new Set(['staged', 'uploading', 'uploaded', 'failed', 'missing_file']);
const DOCUMENT_STATUSES = new Set(['staged', 'uploading', 'uploaded', 'attaching', 'attached', 'failed', 'missing_file']);

const restoreEvidence = (raw: unknown): StagedEvidence | null => {
  if (!isObject(raw)) return null;
  const key = asString(raw.key);
  const status = typeof raw.status === 'string' && EVIDENCE_STATUSES.has(raw.status) ? raw.status : null;
  if (!key || !status) return null;
  const uploadId = asString(raw.uploadId);
  const base = {
    key,
    name: asString(raw.name) ?? '',
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    detectedType: asImageType(raw.detectedType),
  };
  // Only a photo the server confirmed survives a reload; anything else needs its file again.
  if (status === 'uploaded' && uploadId) return { ...base, status: 'uploaded', uploadId };
  return { ...base, status: 'missing_file' };
};

const restoreDocument = (raw: unknown): StagedDocument | null => {
  if (!isObject(raw)) return null;
  const key = asString(raw.key);
  const status = typeof raw.status === 'string' && DOCUMENT_STATUSES.has(raw.status) ? raw.status : null;
  const category =
    typeof raw.category === 'string' && (OWNERSHIP_DOCUMENT_CATEGORIES as string[]).includes(raw.category)
      ? (raw.category as OwnershipDocumentCategory)
      : null;
  if (!key || !status || !category) return null;
  const uploadId = asString(raw.uploadId);
  const evidenceId = asString(raw.evidenceId);
  const base = {
    key,
    name: asString(raw.name) ?? '',
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    detectedType: asImageType(raw.detectedType),
    category,
  };
  if (status === 'attached' && evidenceId) return { ...base, status: 'attached', uploadId: uploadId ?? undefined, evidenceId };
  // Uploaded but not (yet) attached: the upload id is enough, only the attach is repeated.
  if (uploadId) return { ...base, status: 'uploaded', uploadId };
  return { ...base, status: 'missing_file' };
};

/**
 * Turn stored JSON back into a draft. Returns null for anything that is not a v1 record of a
 * draft. Unknown values are dropped; files that were not on the server become `missing_file`; the
 * step is pulled back to the first step that is not complete (so a reload on Review with a lost
 * photo lands on Evidence, and an event date that has since left the 30-day window lands on Event).
 */
export const restoreClaimDraft = (raw: unknown, now: number = Date.now()): RestoredClaimDraft | null => {
  if (!isObject(raw) || raw.v !== CLAIM_DRAFT_VERSION) return null;
  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : null;
  if (savedAt === null || now - savedAt > CLAIM_DRAFT_TTL_MS || savedAt - now > CLAIM_DRAFT_TTL_MS) return null;
  const stored = raw.draft;
  if (!isObject(stored)) return null;

  const relationship = asString(stored.claimantRelationship);
  const eventType = asString(stored.eventType);
  const idempotencyKey = asString(stored.idempotencyKey);
  const evidence = (Array.isArray(stored.evidence) ? stored.evidence : [])
    .map(restoreEvidence)
    .filter((e): e is StagedEvidence => e !== null)
    .slice(0, CLAIM_EVIDENCE_MAX);
  const documents = (Array.isArray(stored.documents) ? stored.documents : [])
    .map(restoreDocument)
    .filter((d): d is StagedDocument => d !== null)
    .slice(0, CLAIM_DOCUMENT_MAX);

  const draft: ClaimDraft = {
    step: asStep(stored.step) ?? 'parcel',
    reachedStep: asStep(stored.reachedStep) ?? asStep(stored.step) ?? 'parcel',
    parcelId: asString(stored.parcelId),
    claimantRelationship:
      relationship && CLAIMANT_RELATIONSHIP_SET.has(relationship) ? (relationship as ClaimantRelationship) : null,
    eventType: eventType && CLAIM_EVENT_TYPE_SET.has(eventType) ? (eventType as LossEventType) : null,
    eventDate: asString(stored.eventDate),
    geometry: asPolygon(stored.geometry),
    // The key must survive a reload (a retry after reload re-uses it); a bad one is replaced.
    idempotencyKey: idempotencyKey && isValidIdempotencyKey(idempotencyKey) ? idempotencyKey : generateIdempotencyKey(),
    evidence,
    documents,
    claimId: asString(stored.claimId),
  };

  // Clamp the open step (and the furthest reached one) to the first incomplete step.
  const furthest = furthestValidStepIndex(draft);
  const stepIndex = Math.min(CLAIM_WIZARD_STEPS.indexOf(draft.step), furthest);
  const reachedIndex = Math.max(CLAIM_WIZARD_STEPS.indexOf(draft.reachedStep), stepIndex);
  draft.step = CLAIM_WIZARD_STEPS[stepIndex];
  draft.reachedStep = CLAIM_WIZARD_STEPS[reachedIndex];

  const missingCount =
    evidence.filter((e) => e.status === 'missing_file').length +
    documents.filter((d) => d.status === 'missing_file').length;
  const dateInvalid = draft.eventDate !== null && !validateClaimDate(draft.eventDate).ok;
  return { draft, savedAt, missingCount, dateInvalid };
};

/** Read the user's saved draft. Expired, corrupt or other-version records are removed. */
export const loadClaimDraft = (
  owner: string | null | undefined,
  options: DraftStorageOptions = {}
): RestoredClaimDraft | null => {
  const key = claimDraftStorageKey(owner);
  const storage = resolveStorage(options);
  if (!key || !storage) return null;
  let text: string | null;
  try {
    text = storage.getItem(key);
  } catch {
    return null;
  }
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const restored = restoreClaimDraft(parsed, options.now ?? Date.now());
  if (!restored) clearClaimDraft(owner, { storage });
  return restored;
};
