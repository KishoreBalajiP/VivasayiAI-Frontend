import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../test/memoryStorage';
import {
  CLAIM_DRAFT_KEY_PREFIX,
  CLAIM_DRAFT_TTL_MS,
  claimDraftStorageKey,
  clearClaimDraft,
  draftOwnerFromUser,
  isDraftWorthSaving,
  loadClaimDraft,
  readStoredDraftOwner,
  restoreClaimDraft,
  saveClaimDraft,
  serializeClaimDraft,
} from './claimDraftStorage';
import { createEmptyDraft, wizardReducer, type ClaimDraft } from './claimFlow';
import type { GeoJsonPolygon } from '../types';

// Draft persistence for the claim wizard (plan B3, design §8.5). DRF-* in the acceptance matrix.

const POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [[[78.1, 11.1], [78.2, 11.1], [78.2, 11.2], [78.1, 11.2], [78.1, 11.1]]],
};

const NOW = Date.UTC(2026, 9, 16, 6, 0, 0);
const isoDaysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString().slice(0, 10);

// A realistic mid-flight draft: claim created, one photo stored, one still local, one failed; one
// document attached, one uploaded but not attached, one never uploaded.
const midFlightDraft = (eventDate = new Date().toISOString().slice(0, 10)): ClaimDraft => {
  let d = createEmptyDraft();
  d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_1', geometry: POLYGON });
  d = wizardReducer(d, { type: 'select.relationship', relationship: 'tenant' });
  d = wizardReducer(d, { type: 'select.event', eventType: 'flood' });
  d = wizardReducer(d, { type: 'select.date', eventDate });
  for (const key of ['ev_up', 'ev_local', 'ev_failed']) {
    d = wizardReducer(d, { type: 'evidence.add', entry: { key, name: `${key}.jpg`, size: 10, detectedType: 'jpeg' } });
  }
  for (const [key, category] of [['doc_att', 'lease_agreement'], ['doc_up', 'land_record'], ['doc_new', 'tax_receipt']] as const) {
    d = wizardReducer(d, { type: 'document.add', entry: { key, name: `${key}.png`, size: 20, detectedType: 'png', category } });
  }
  d = wizardReducer(d, { type: 'claim.created', claimId: 'c_1' });
  d = wizardReducer(d, { type: 'evidence.uploaded', key: 'ev_up', uploadId: 'img_1' });
  d = wizardReducer(d, { type: 'evidence.failed', key: 'ev_failed', errorKey: 'networkError' });
  d = wizardReducer(d, { type: 'document.uploaded', key: 'doc_att', uploadId: 'up_a' });
  d = wizardReducer(d, { type: 'document.attached', key: 'doc_att', evidenceId: 'own_a' });
  d = wizardReducer(d, { type: 'document.uploaded', key: 'doc_up', uploadId: 'up_b' });
  d = wizardReducer(d, { type: 'document.failed', key: 'doc_up', errorKey: 'serverError', failedPhase: 'attach' });
  for (let i = 0; i < 4; i++) d = wizardReducer(d, { type: 'next' });
  return d;
};

describe('claim draft storage', () => {
  it('DRF-1: stores plain metadata only — no File objects or other stray values', () => {
    const storage = createMemoryStorage();
    const draft = midFlightDraft();
    // Something non-serialisable smuggled onto an entry must never reach storage.
    const polluted = {
      ...draft,
      evidence: draft.evidence.map((e) => ({ ...e, file: new Blob(['x']), preview: 'blob:abc' })),
    } as unknown as ClaimDraft;
    expect(saveClaimDraft('sub-1', polluted, { storage, now: NOW })).toBe(true);

    const raw = storage.getItem('vivasayi.claimDraft.v1:sub-1');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw as string);
    expect(stored).toMatchObject({ v: 1, savedAt: NOW });
    const allowed = new Set(['key', 'name', 'size', 'detectedType', 'status', 'uploadId', 'errorKey']);
    expect(stored.draft.evidence).toHaveLength(3);
    for (const entry of stored.draft.evidence) {
      expect(Object.keys(entry).filter((k) => !allowed.has(k))).toEqual([]);
    }
    expect(raw).not.toContain('blob:');
    // Byte-for-byte the same as the clean draft: the pollution was dropped, not encoded.
    expect(raw).toBe(serializeClaimDraft(draft, NOW));
  });

  it('DRF-2: on restore, everything not yet on the server is marked missing_file', () => {
    const storage = createMemoryStorage();
    saveClaimDraft('sub-1', midFlightDraft(), { storage, now: NOW });
    const restored = loadClaimDraft('sub-1', { storage, now: NOW + 60_000 });
    expect(restored).not.toBeNull();
    const { draft, missingCount } = restored!;

    expect(draft.evidence.map((e) => [e.key, e.status, e.uploadId])).toEqual([
      ['ev_up', 'uploaded', 'img_1'],
      ['ev_local', 'missing_file', undefined],
      ['ev_failed', 'missing_file', undefined],
    ]);
    expect(draft.documents.map((d) => [d.key, d.status, d.uploadId ?? null, d.evidenceId ?? null, d.category])).toEqual([
      ['doc_att', 'attached', 'up_a', 'own_a', 'lease_agreement'],
      // Uploaded but not attached: only the attach is repeated, no file needed.
      ['doc_up', 'uploaded', 'up_b', null, 'land_record'],
      ['doc_new', 'missing_file', null, null, 'tax_receipt'],
    ]);
    expect(missingCount).toBe(3);
    // The claim id survives, so a retry never creates a second claim (the key: next test).
    expect(draft.claimId).toBe('c_1');
    // Saved on Review, but files are missing: the farmer lands on Evidence.
    expect(draft.step).toBe('evidence');
    expect(draft.reachedStep).toBe('review');
  });

  it('DRF-2: the idempotency key and answers are restored exactly', () => {
    const storage = createMemoryStorage();
    const original = midFlightDraft();
    saveClaimDraft('sub-1', original, { storage, now: NOW });
    const { draft } = loadClaimDraft('sub-1', { storage, now: NOW })!;
    expect(draft.idempotencyKey).toBe(original.idempotencyKey);
    expect(draft).toMatchObject({
      parcelId: 'par_1',
      claimantRelationship: 'tenant',
      eventType: 'flood',
      eventDate: original.eventDate,
      geometry: POLYGON,
    });
  });

  it('DRF-3: a draft expires 24 h after it was saved and is then removed', () => {
    const storage = createMemoryStorage();
    saveClaimDraft('sub-1', midFlightDraft(), { storage, now: NOW });
    expect(loadClaimDraft('sub-1', { storage, now: NOW + CLAIM_DRAFT_TTL_MS - 1 })).not.toBeNull();
    expect(loadClaimDraft('sub-1', { storage, now: NOW + CLAIM_DRAFT_TTL_MS + 1 })).toBeNull();
    expect(storage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
    expect(CLAIM_DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('DRF-4: a record of another version is ignored and removed', () => {
    const storage = createMemoryStorage();
    const key = claimDraftStorageKey('sub-1') as string;
    storage.setItem(key, JSON.stringify({ v: 2, savedAt: NOW, draft: midFlightDraft() }));
    expect(loadClaimDraft('sub-1', { storage, now: NOW })).toBeNull();
    expect(storage.getItem(key)).toBeNull();
    expect(restoreClaimDraft({ savedAt: NOW, draft: midFlightDraft() }, NOW)).toBeNull();
  });

  it('DRF-5: drafts are kept per user, and nothing is stored without a user', () => {
    const storage = createMemoryStorage();
    expect(claimDraftStorageKey('sub-1')).toBe('vivasayi.claimDraft.v1:sub-1');
    expect(claimDraftStorageKey('  ')).toBeNull();
    expect(claimDraftStorageKey(null)).toBeNull();
    expect(draftOwnerFromUser({ cognitoSub: 'sub-1', email: 'a@x.test' })).toBe('sub-1');
    expect(draftOwnerFromUser({ email: 'a@x.test' })).toBe('a@x.test');
    expect(draftOwnerFromUser(null)).toBeNull();

    saveClaimDraft('sub-1', midFlightDraft(), { storage, now: NOW });
    expect(loadClaimDraft('sub-2', { storage, now: NOW })).toBeNull();
    expect(loadClaimDraft('sub-1', { storage, now: NOW })).not.toBeNull();
    expect(saveClaimDraft(null, midFlightDraft(), { storage, now: NOW })).toBe(false);
    expect(storage.length).toBe(1);

    clearClaimDraft('sub-2', { storage });
    expect(storage.length).toBe(1);
    clearClaimDraft('sub-1', { storage });
    expect(storage.length).toBe(0);

    // The owner comes from the signed-in user AuthContext stores in the session.
    storage.setItem('vivasayi.auth:user', JSON.stringify({ email: 'farmer@x.test', cognitoSub: 'sub-9' }));
    expect(readStoredDraftOwner(storage)).toBe('sub-9');
    storage.setItem('vivasayi.auth:user', '{not json');
    expect(readStoredDraftOwner(storage)).toBeNull();
    expect(readStoredDraftOwner(null)).toBeNull();
  });

  it('DRF-6: corrupt JSON is ignored and removed; unknown values never reach the draft', () => {
    const storage = createMemoryStorage();
    const key = claimDraftStorageKey('sub-1') as string;
    storage.setItem(key, '{"v":1,"savedAt":');
    expect(loadClaimDraft('sub-1', { storage, now: NOW })).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    const restored = restoreClaimDraft(
      {
        v: 1,
        savedAt: NOW,
        draft: {
          step: 'payment',
          parcelId: 'par_1',
          claimantRelationship: 'landlord',
          eventType: 'meteor',
          eventDate: isoDaysAgo(2),
          geometry: { type: 'Point', coordinates: [1, 2] },
          idempotencyKey: 'bad key!',
          evidence: [{ key: 'ev_1', name: 'a.jpg', size: 1, detectedType: 'gif', status: 'teleported' }, 'junk', null],
          documents: [{ key: 'doc_1', name: 'd.png', size: 1, category: 'passport', status: 'staged' }],
          claimId: 42,
        },
      },
      NOW
    );
    expect(restored).not.toBeNull();
    const { draft } = restored!;
    expect(draft.step).toBe('parcel');
    expect(draft.claimantRelationship).toBeNull();
    expect(draft.eventType).toBeNull();
    expect(draft.geometry).toBeNull();
    expect(draft.evidence).toEqual([]);
    expect(draft.documents).toEqual([]);
    expect(draft.claimId).toBeNull();
    // A bad key is replaced by a valid one rather than sent.
    expect(draft.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

    // Blocked storage: nothing throws, nothing is persisted.
    const blocked = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;
    expect(saveClaimDraft('sub-1', midFlightDraft(), { storage: blocked })).toBe(false);
    expect(loadClaimDraft('sub-1', { storage: blocked })).toBeNull();
  });

  it('DRF-7: draft keys use the prefix that logout clears (AuthContext clearClaimDrafts)', () => {
    expect(CLAIM_DRAFT_KEY_PREFIX).toBe('vivasayi.claimDraft.');
    expect(claimDraftStorageKey('sub-1')?.startsWith(CLAIM_DRAFT_KEY_PREFIX)).toBe(true);
    // Cross-check against the source of the clearing code so the two can never drift apart. The
    // clearing behaviour itself is covered by AuthContext.test.tsx (DRF-7).
    const authSource = Object.values(
      import.meta.glob<string>('/src/context/AuthContext.tsx', { query: '?raw', import: 'default', eager: true })
    )[0];
    expect(authSource).toContain(`const CLAIM_DRAFT_KEY_PREFIX = '${CLAIM_DRAFT_KEY_PREFIX}'`);
    expect(authSource).toMatch(/logout = useCallback\(\(\) => \{\s*clearClaimDrafts\(\);/);
  });

  it('DRF-8: the event date is checked again on restore', () => {
    const storage = createMemoryStorage();
    // Saved on Review 40 days after the event: the 30-day window has closed since.
    const realNow = Date.now();
    const stale = midFlightDraft(new Date(realNow - 40 * 86_400_000).toISOString().slice(0, 10));
    const stillValid = midFlightDraft(new Date(realNow - 3 * 86_400_000).toISOString().slice(0, 10));
    saveClaimDraft('sub-stale', stale, { storage, now: realNow });
    saveClaimDraft('sub-ok', stillValid, { storage, now: realNow });

    const staleRestore = loadClaimDraft('sub-stale', { storage, now: realNow })!;
    expect(staleRestore.dateInvalid).toBe(true);
    // Pulled back to the Event step, where the date error is shown.
    expect(staleRestore.draft.step).toBe('event');
    const okRestore = loadClaimDraft('sub-ok', { storage, now: realNow })!;
    expect(okRestore.dateInvalid).toBe(false);
  });

  it('only drafts with something the farmer entered are worth saving', () => {
    const auto = wizardReducer(createEmptyDraft(), { type: 'select.parcel', parcelId: 'par_1', geometry: POLYGON });
    expect(isDraftWorthSaving(createEmptyDraft())).toBe(false);
    // The parcel alone is auto-selected for single-parcel farmers; it is not the farmer's input.
    expect(isDraftWorthSaving(auto)).toBe(false);
    expect(isDraftWorthSaving(wizardReducer(auto, { type: 'select.event', eventType: 'flood' }))).toBe(true);
  });
});
