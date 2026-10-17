import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../api/client';
import { submitClaimTracked } from '../api/claims';
import { createEmptyDraft, wizardReducer, type ClaimDraft, type WizardNavigation } from './claimFlow';
import {
  SUBMIT_RETRY_DELAY_MS,
  buildClaimCreateInput,
  retrySubmissionItem,
  runClaimSubmission,
  submissionErrorKey,
  submissionRequestId,
  type SubmissionDeps,
  type SubmissionPhase,
} from './claimSubmission';
import type { GeoJsonPolygon, LossClaim, OwnershipDocumentCategory } from '../types';

// The submission orchestrator (plan B3, design §8.3). SUB-* in the acceptance matrix. Every
// dependency is a stub; the order of calls is the thing under test.

const POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [[[78.1, 11.1], [78.2, 11.1], [78.2, 11.2], [78.1, 11.2], [78.1, 11.1]]],
};

const today = new Date().toISOString().slice(0, 10);

const buildDraft = (
  photos: string[] = ['ev_1'],
  documents: [string, OwnershipDocumentCategory][] = []
): ClaimDraft => {
  let d = createEmptyDraft();
  d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_1', geometry: POLYGON });
  d = wizardReducer(d, { type: 'select.event', eventType: 'flood' });
  d = wizardReducer(d, { type: 'select.date', eventDate: today });
  for (const key of photos) {
    d = wizardReducer(d, { type: 'evidence.add', entry: { key, name: `${key}.jpg`, size: 10, detectedType: 'jpeg' } });
  }
  for (const [key, category] of documents) {
    d = wizardReducer(d, { type: 'document.add', entry: { key, name: `${key}.png`, size: 10, detectedType: 'png', category } });
  }
  return d;
};

const claim = (state: LossClaim['state'] = 'draft') => ({ id: 'c_1', state }) as unknown as LossClaim;

let calls: string[];
let deps: SubmissionDeps & { [K in keyof Required<SubmissionDeps>]: ReturnType<typeof vi.fn> };
let actions: WizardNavigation[];
let phases: SubmissionPhase[];

const files: Record<string, File> = {};
const getFile = (key: string) => files[key] ?? new File([new Uint8Array([1, 2, 3])], `${key}.bin`);

const run = (draft: ClaimDraft, extra: { previousSubmitAttempts?: number; getFile?: (key: string) => File | undefined } = {}) =>
  runClaimSubmission({
    draft,
    getFile: extra.getFile ?? getFile,
    deps,
    dispatch: (action) => actions.push(action),
    onPhase: (phase) => phases.push(phase),
    previousSubmitAttempts: extra.previousSubmitAttempts,
  });

/** The draft after replaying every action the run emitted (what the wizard's reducer holds). */
const replay = (draft: ClaimDraft) => actions.reduce(wizardReducer, draft);

beforeEach(() => {
  calls = [];
  actions = [];
  phases = [];
  deps = {
    createClaim: vi.fn(async () => {
      calls.push('create');
      return claim('draft');
    }),
    uploadPhoto: vi.fn(async (_claimId: string, file: File) => {
      calls.push(`photo:${file.name}`);
      return { uploadId: `img_${file.name}`, status: 'stored' } as never;
    }),
    uploadDocumentFile: vi.fn(async (file: File) => {
      calls.push(`upload:${file.name}`);
      return { uploadId: `up_${file.name}` } as never;
    }),
    attachDocument: vi.fn(async (_claimId: string, input: { uploadId: string }) => {
      calls.push(`attach:${input.uploadId}`);
      return { id: `own_${input.uploadId}` } as never;
    }),
    submitClaim: vi.fn(async () => {
      calls.push('submit');
      return claim('submitted');
    }),
    wait: vi.fn(async () => {}),
  } as never;
});

describe('claim submission orchestrator', () => {
  it('SUB-1: creates once with the draft key, then photos, documents (upload → attach), submit', async () => {
    const draft = buildDraft(['ev_1', 'ev_2'], [['doc_1', 'land_record']]);
    const result = await run(draft);

    expect(result).toMatchObject({ ok: true, claim: { id: 'c_1', state: 'submitted' }, submitAttempts: 1 });
    expect(calls).toEqual([
      'create',
      'photo:ev_1.bin',
      'photo:ev_2.bin',
      'upload:doc_1.bin',
      'attach:up_doc_1.bin',
      'submit',
    ]);
    const input = deps.createClaim.mock.calls[0][0];
    expect(input).toEqual({
      parcelId: 'par_1',
      eventType: 'flood',
      eventDate: today,
      geometry: POLYGON,
      idempotencyKey: draft.idempotencyKey,
    });
    expect(deps.attachDocument).toHaveBeenCalledWith('c_1', { uploadId: 'up_doc_1.bin', documentCategory: 'land_record' });
    expect(actions[0]).toEqual({ type: 'claim.created', claimId: 'c_1' });
    const after = replay(draft);
    expect(after.claimId).toBe('c_1');
    expect(after.evidence.map((e) => e.status)).toEqual(['uploaded', 'uploaded']);
    expect(after.documents[0]).toMatchObject({ status: 'attached', uploadId: 'up_doc_1.bin', evidenceId: 'own_up_doc_1.bin' });
  });

  it('SUB-1: create is skipped when the draft already has a claim, and uploaded items are skipped', async () => {
    let draft = wizardReducer(buildDraft(['ev_1', 'ev_2']), { type: 'claim.created', claimId: 'c_7' });
    draft = wizardReducer(draft, { type: 'evidence.uploaded', key: 'ev_1', uploadId: 'img_old' });
    const result = await run(draft);

    expect(result.ok).toBe(true);
    expect(deps.createClaim).not.toHaveBeenCalled();
    expect(calls).toEqual(['photo:ev_2.bin', 'submit']);
    expect(deps.uploadPhoto).toHaveBeenCalledWith('c_7', expect.any(File));
    expect(deps.submitClaim).toHaveBeenCalledWith('c_7', { requestId: submissionRequestId(draft.idempotencyKey!, 1) });
  });

  it('SUB-2: a document that already has an uploadId is only attached again', async () => {
    let draft = buildDraft(['ev_1'], [['doc_1', 'lease_agreement']]);
    draft = wizardReducer(draft, { type: 'claim.created', claimId: 'c_1' });
    draft = wizardReducer(draft, { type: 'evidence.uploaded', key: 'ev_1', uploadId: 'img_1' });
    draft = wizardReducer(draft, { type: 'document.uploaded', key: 'doc_1', uploadId: 'up_kept' });
    draft = wizardReducer(draft, { type: 'document.failed', key: 'doc_1', errorKey: 'serverError', failedPhase: 'attach' });

    const result = await run(draft, { getFile: () => undefined }); // the file is gone; not needed
    expect(result.ok).toBe(true);
    expect(deps.uploadDocumentFile).not.toHaveBeenCalled();
    expect(calls).toEqual(['attach:up_kept', 'submit']);
    expect(deps.attachDocument).toHaveBeenCalledWith('c_1', { uploadId: 'up_kept', documentCategory: 'lease_agreement' });
  });

  it('SUB-3: a failed photo stops BEFORE submit; the other items are still tried', async () => {
    deps.uploadPhoto.mockImplementation(async (_claimId: string, file: File) => {
      calls.push(`photo:${file.name}`);
      if (file.name === 'ev_2.bin') throw new ApiClientError(500, 'serverError');
      return { uploadId: `img_${file.name}` } as never;
    });
    const draft = buildDraft(['ev_1', 'ev_2', 'ev_3'], [['doc_1', 'land_record']]);
    const result = await run(draft);

    expect(result).toMatchObject({
      ok: false,
      phase: 'photos',
      status: 500,
      claimId: 'c_1',
      failedKeys: ['ev_2'],
      errorKey: 'submitError_items_failed',
      submitAttempts: 0,
    });
    expect(calls).toEqual(['create', 'photo:ev_1.bin', 'photo:ev_2.bin', 'photo:ev_3.bin', 'upload:doc_1.bin', 'attach:up_doc_1.bin']);
    expect(deps.submitClaim).not.toHaveBeenCalled();
    const after = replay(draft);
    expect(after.evidence.map((e) => e.status)).toEqual(['uploaded', 'failed', 'uploaded']);
    expect(after.evidence[1].errorKey).toBe('serverError');
  });

  it('SUB-3: a 429 or a lost connection stops the batch at once (no more calls)', async () => {
    deps.uploadPhoto.mockImplementationOnce(async () => {
      calls.push('photo:first');
      throw new ApiClientError(429, 'rateLimited');
    });
    const result = await run(buildDraft(['ev_1', 'ev_2'], [['doc_1', 'land_record']]));
    expect(result).toMatchObject({ ok: false, phase: 'photos', status: 429, errorKey: 'submitError_rate_evidence' });
    expect(calls).toEqual(['create', 'photo:first']);
  });

  it('SUB-4: never submits with fewer than one uploaded photo', async () => {
    const result = await run(buildDraft([]));
    expect(result).toMatchObject({ ok: false, phase: 'photos', errorKey: 'reviewReason_no_photos' });
    expect(deps.submitClaim).not.toHaveBeenCalled();
  });

  it('SUB-5: a 503 on submit is retried once after 1.5 s with a new x-request-id, then succeeds', async () => {
    deps.submitClaim
      .mockImplementationOnce(async () => {
        throw new ApiClientError(503, 'serviceBusy');
      })
      .mockImplementationOnce(async () => claim('submitted'));
    const draft = buildDraft();
    const result = await run(draft);

    expect(result).toMatchObject({ ok: true, submitAttempts: 2 });
    expect(deps.wait).toHaveBeenCalledTimes(1);
    expect(deps.wait).toHaveBeenCalledWith(SUBMIT_RETRY_DELAY_MS);
    expect(SUBMIT_RETRY_DELAY_MS).toBe(1500);
    expect(deps.submitClaim.mock.calls.map((c) => c[1].requestId)).toEqual([
      `fe_${draft.idempotencyKey}_s1`,
      `fe_${draft.idempotencyKey}_s2`,
    ]);
  });

  it('SUB-5: only ONE automatic retry — a second 503 (or a network error) is reported', async () => {
    deps.submitClaim.mockRejectedValue(new ApiClientError(503, 'serviceBusy'));
    const result = await run(buildDraft());
    expect(result).toMatchObject({
      ok: false,
      phase: 'submit',
      status: 503,
      claimId: 'c_1',
      errorKey: 'submitError_submit_unavailable',
      submitAttempts: 2,
    });
    expect(deps.submitClaim).toHaveBeenCalledTimes(2);

    deps.submitClaim.mockReset();
    deps.submitClaim.mockRejectedValue(new ApiClientError(0, 'networkError'));
    const network = await run(buildDraft());
    expect(network).toMatchObject({ ok: false, status: 0, errorKey: 'submitError_network' });
    expect(deps.submitClaim).toHaveBeenCalledTimes(2);
  });

  it('SUB-5: other submit errors are not retried, and attempt numbers continue across runs', async () => {
    deps.submitClaim.mockRejectedValue(new ApiClientError(409, 'conflict'));
    const draft = wizardReducer(buildDraft(), { type: 'claim.created', claimId: 'c_1' });
    const result = await run(draft, { previousSubmitAttempts: 2 });
    expect(result).toMatchObject({ ok: false, phase: 'submit', status: 409, errorKey: 'submitError_conflict', submitAttempts: 1 });
    expect(deps.submitClaim).toHaveBeenCalledTimes(1);
    expect(deps.submitClaim.mock.calls[0][1]).toEqual({ requestId: `fe_${draft.idempotencyKey}_s3` });

    // A "success" that left the claim in draft is not reported as submitted.
    deps.submitClaim.mockReset();
    deps.submitClaim.mockResolvedValue(claim('draft'));
    expect(await run(draft)).toMatchObject({ ok: false, phase: 'submit' });
  });

  it('SUB-6: a 401 anywhere ends the run with authExpired and no further calls', async () => {
    deps.createClaim.mockRejectedValueOnce(new ApiClientError(401, 'authExpired'));
    expect(await run(buildDraft())).toMatchObject({ ok: false, phase: 'create', authExpired: true, errorKey: 'authExpired', claimId: null });
    expect(deps.uploadPhoto).not.toHaveBeenCalled();

    calls = [];
    deps.uploadPhoto.mockImplementationOnce(async () => {
      calls.push('photo:401');
      throw new ApiClientError(401, 'authExpired');
    });
    const result = await run(buildDraft(['ev_1', 'ev_2'], [['doc_1', 'land_record']]));
    expect(result).toMatchObject({ ok: false, phase: 'photos', authExpired: true, claimId: 'c_1' });
    expect(calls).toEqual(['create', 'photo:401']);
    expect(deps.submitClaim).not.toHaveBeenCalled();
  });

  it('SUB-7: failedKeys lists every photo and document that failed', async () => {
    deps.uploadPhoto.mockImplementation(async (_claimId: string, file: File) => {
      if (file.name === 'ev_1.bin') throw new ApiClientError(413, 'imageTooLarge');
      return { uploadId: 'img' } as never;
    });
    deps.attachDocument.mockRejectedValue(new ApiClientError(500, 'serverError'));
    const draft = buildDraft(['ev_1', 'ev_2'], [['doc_1', 'land_record'], ['doc_2', 'other']]);
    const result = await run(draft);

    expect(result).toMatchObject({ ok: false, phase: 'photos', failedKeys: ['ev_1', 'doc_1', 'doc_2'] });
    const after = replay(draft);
    // The document bytes are on the server; a retry will only attach.
    expect(after.documents.map((d) => [d.status, d.failedPhase, d.uploadId])).toEqual([
      ['failed', 'attach', 'up_doc_1.bin'],
      ['failed', 'attach', 'up_doc_2.bin'],
    ]);
  });

  it('SUB-8: reports each phase as it starts, and the failing phase with a message for its limiter', async () => {
    await run(buildDraft(['ev_1'], [['doc_1', 'land_record']]));
    expect(phases).toEqual(['create', 'photos', 'documents', 'submit']);

    phases = [];
    deps.createClaim.mockRejectedValueOnce(new ApiClientError(429, 'rateLimited'));
    expect(await run(buildDraft())).toMatchObject({ ok: false, phase: 'create', errorKey: 'submitError_rate_claims' });
    expect(phases).toEqual(['create']);

    deps.uploadDocumentFile.mockRejectedValueOnce(new ApiClientError(429, 'rateLimited'));
    expect(await run(buildDraft(['ev_1'], [['doc_1', 'land_record']]))).toMatchObject({
      ok: false,
      phase: 'documents',
      errorKey: 'submitError_rate_upload',
      failedKeys: ['doc_1'],
    });

    // A file the wizard no longer holds is reported as missing, never sent empty.
    const missing = await run(buildDraft(['ev_1']), { getFile: () => undefined });
    expect(missing).toMatchObject({ ok: false, phase: 'photos', errorKey: 'submitError_missing_files', failedKeys: ['ev_1'] });
  });

  it('SUB-8: messages by phase and status (design §8.4)', () => {
    expect(submissionErrorKey('create', 429)).toBe('submitError_rate_claims');
    expect(submissionErrorKey('submit', 429)).toBe('submitError_rate_claims');
    expect(submissionErrorKey('documents', 429, { documentStep: 'upload' })).toBe('submitError_rate_upload');
    expect(submissionErrorKey('documents', 429, { documentStep: 'attach' })).toBe('submitError_rate_evidence');
    expect(submissionErrorKey('photos', 429)).toBe('submitError_rate_evidence');
    expect(submissionErrorKey('submit', 503)).toBe('submitError_submit_unavailable');
    expect(submissionErrorKey('create', 503)).toBe('submitError_unavailable');
    expect(submissionErrorKey('photos', 0)).toBe('submitError_network');
    expect(submissionErrorKey('submit', 409)).toBe('submitError_conflict');
    expect(submissionErrorKey('create', 400)).toBe('submitError_bad_request');
    expect(submissionErrorKey('photos', 400)).toBe('submitError_items_failed');
    expect(submissionErrorKey('submit', 401)).toBe('authExpired');
    expect(submissionErrorKey('submit', 500)).toBe('submitError_generic');
    expect(submissionErrorKey('photos', 500)).toBe('submitError_items_failed');
    expect(submissionErrorKey('photos', -1, { missingFile: true })).toBe('submitError_missing_files');
  });

  it('builds the request id the backend accepts, and the create body from the draft only', () => {
    const id = submissionRequestId('clm_abc_123', 2);
    expect(id).toBe('fe_clm_abc_123_s2');
    const long = submissionRequestId('k'.repeat(64), 12);
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
    expect(long.endsWith('_s12')).toBe(true);

    const withRelationship = wizardReducer(buildDraft(), { type: 'select.relationship', relationship: 'heir' });
    expect(buildClaimCreateInput(withRelationship)).toMatchObject({ claimantRelationship: 'heir' });
    expect(buildClaimCreateInput(buildDraft())).not.toHaveProperty('claimantRelationship');
    expect(buildClaimCreateInput({ ...buildDraft(), geometry: null })).toBeNull();
  });

  it('retries ONE item against the saved claim without creating or submitting', async () => {
    let draft = wizardReducer(buildDraft(['ev_1', 'ev_2']), { type: 'claim.created', claimId: 'c_1' });
    draft = wizardReducer(draft, { type: 'evidence.failed', key: 'ev_2', errorKey: 'networkError' });
    const result = await retrySubmissionItem({
      draft,
      getFile,
      deps,
      dispatch: (action) => actions.push(action),
      kind: 'photo',
      key: 'ev_2',
    });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(calls).toEqual(['photo:ev_2.bin']);
    expect(replay(draft).evidence[1].status).toBe('uploaded');

    // Without a saved claim there is nothing to attach to.
    expect(await retrySubmissionItem({ draft: buildDraft(), getFile, deps, dispatch: () => {}, kind: 'photo', key: 'ev_1' })).toEqual({
      ok: false,
      status: -1,
    });
  });
});

// The API helper the wizard passes as `onSubmitClaim` (src/api/claims.ts, additive).
describe('submitClaimTracked', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('SUB-5: sends the x-request-id header on POST /claims/:id/submit, and none when not given', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ statusCode: 200, message: 'ok', data: { claim: { id: 'c_1', state: 'submitted' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const submitted = await submitClaimTracked('c_1', { requestId: 'fe_clm_abc_s1' });
    expect(submitted).toEqual({ id: 'c_1', state: 'submitted' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/claims\/c_1\/submit$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-request-id']).toBe('fe_clm_abc_s1');
    // No body: nothing the client sends can change the submit.
    expect(init.body).toBeUndefined();

    await submitClaimTracked('c_1');
    const [, plain] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(plain.headers as Record<string, string>).not.toHaveProperty('x-request-id');
  });

  it('SUB-5: a 503 from submit surfaces as ApiClientError(503) for the orchestrator to retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ statusCode: 503, message: 'saved but checks could not be scheduled', data: null }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    await expect(submitClaimTracked('c_1', { requestId: 'fe_clm_abc_s1' })).rejects.toMatchObject({ status: 503 });
  });
});
