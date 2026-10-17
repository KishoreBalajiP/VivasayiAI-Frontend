// Component-level tests for the claim wizard's affected-area step. As in ManageParcels.test.tsx,
// ParcelDrawMap is replaced by a stand-in because MapLibre needs WebGL.
//
// The property under test is the one that matters for money: the polygon the farmer draws on the
// area step is what gets submitted as the claim geometry, it is NOT silently replaced by the full
// parcel boundary, and no acreage is ever sent from the client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';
import { ApiClientError } from '../api/client';
import { createMemoryStorage } from '../test/memoryStorage';

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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// jsdom's Blob.arrayBuffer() is not dependable across versions, and image sniffing has its own
// unit tests. Staging behaviour is what these tests exercise, so the sniffer is stubbed out.
const { mockValidateImageFile } = vi.hoisted(() => ({ mockValidateImageFile: vi.fn() }));
vi.mock('../utils/imageValidation', () => ({
  validateImageFile: mockValidateImageFile,
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
}));

// Stand-in map. `drawAffected` emits a polygon strictly INSIDE the parcel boundary, which is what
// lets these tests tell an affected area apart from the whole parcel. `clearAffected` models the
// farmer erasing their drawing, which must NOT silently promote the claim to the whole parcel.
vi.mock('./LazyParcelDrawMap', () => ({
  LazyParcelDrawMap: ({
    value,
    onChange,
    contextPolygon,
    contextIsContainer,
    readOnly,
  }: {
    value: unknown;
    onChange?: (polygon: unknown) => void;
    contextPolygon?: unknown;
    contextIsContainer?: boolean;
    readOnly?: boolean;
  }) => (
    <div>
      <span data-testid="map-has-value">{value ? 'yes' : 'no'}</span>
      <span data-testid="map-readonly">{readOnly ? 'yes' : 'no'}</span>
      <span data-testid="map-context">{contextPolygon ? 'yes' : 'no'}</span>
      <span data-testid="map-context-is-container">{contextIsContainer ? 'yes' : 'no'}</span>
      <button
        type="button"
        data-testid="map-draw-affected"
        onClick={() =>
          onChange?.({
            type: 'Polygon',
            coordinates: [[[79.11, 10.71], [79.19, 10.71], [79.19, 10.79], [79.11, 10.79], [79.11, 10.71]]],
          })
        }
      >
        draw affected
      </button>
      <button type="button" data-testid="map-clear-affected" onClick={() => onChange?.(null)}>
        clear affected
      </button>
    </div>
  ),
}));

import { ClaimWizard } from './ClaimWizard';
import { toast } from 'sonner';
import type { ClaimCreateInput, GeoJsonPolygon, LossClaim, ParcelRecord } from '../types';

const PARCEL_SQUARE: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[79.1, 10.7], [79.2, 10.7], [79.2, 10.8], [79.1, 10.8], [79.1, 10.7]]],
};

/** Strictly inside PARCEL_SQUARE — the affected area a farmer draws. */
const AFFECTED_SQUARE: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[79.11, 10.71], [79.19, 10.71], [79.19, 10.79], [79.11, 10.79], [79.11, 10.71]]],
};

const parcel = (overrides: Partial<ParcelRecord> = {}): ParcelRecord =>
  ({
    parcelId: 'parcel-1',
    name: 'North Field',
    crop: 'Paddy',
    geometry: PARCEL_SQUARE,
    calculatedAreaAcres: 1.25,
    ...overrides,
  }) as ParcelRecord;

/**
 * A parcel created before boundaries existed. `ParcelRecord.geometry` is typed non-nullable, but
 * legacy rows really do come back with a missing geometry, which is exactly what the wizard must
 * refuse to treat as claimable — hence the explicit cast.
 */
const legacyParcel = (overrides: Partial<ParcelRecord> = {}): ParcelRecord =>
  parcel({ ...overrides, geometry: null as unknown as GeoJsonPolygon });

const onCreateClaim = vi.fn();
const onSubmitClaim = vi.fn();
const onUploadEvidence = vi.fn();

const renderWizard = (parcels: ParcelRecord[]) =>
  render(
    <ClaimWizard
      parcels={parcels}
      parcelsStatus="ready"
      onRetryParcels={() => {}}
      onCreateClaim={onCreateClaim}
      onUploadEvidence={onUploadEvidence}
      onSubmitClaim={onSubmitClaim}
      onDone={() => {}}
      onCancel={() => {}}
      onManageFarm={() => {}}
      onAddFirstParcel={() => {}}
    />
  );

const fakeClaim = {
  id: 'claim-1',
  state: 'draft',
} as unknown as LossClaim;

const submittedClaim = {
  id: 'claim-1',
  state: 'submitted',
} as unknown as LossClaim;

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateImageFile.mockImplementation(async () => ({ type: 'png' as const }));
  onCreateClaim.mockResolvedValue(fakeClaim);
  onSubmitClaim.mockResolvedValue(submittedClaim);
  onUploadEvidence.mockResolvedValue({
    uploadId: 'ev-server-1',
    mediaType: 'image/png',
    status: 'stored',
  } as never);
});

/**
 * Walk the wizard forward until the affected area is on screen (identified by the map stand-in).
 * The area now lives on the merged Event step together with the event type and the date, so the
 * helper fills those two in on that same screen before returning.
 *
 * This is driven by what is actually on screen rather than a fixed click sequence because the
 * wizard auto-selects the only claimable parcel and may skip past the parcel step entirely. The
 * date is derived from now because the claim window is 30 days.
 */
const advanceToAreaStep = async (user: ReturnType<typeof userEvent.setup>) => {
  const next = () => screen.getByRole('button', { name: /continue/i });
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  for (let guard = 0; guard < 6; guard += 1) {
    const flood = screen.queryByRole('button', { name: /^flood$/i });
    if (flood && flood.getAttribute('aria-pressed') !== 'true') await user.click(flood);

    const dateInput = document.querySelector('input[type="date"]');
    if (dateInput) fireEvent.change(dateInput, { target: { value: threeDaysAgo } });

    if (screen.queryByTestId('map-draw-affected')) return;

    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
  }

  throw new Error('wizard never reached the affected-area step');
};

const pngFile = (name: string) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });

/** Stage crop photos through the real photo input (the first file input on the Evidence step). */
const stagePhoto = async (...names: string[]) => {
  const list = names.length > 0 ? names : ['a.png'];
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: list.map(pngFile) } });
  for (const name of list) await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
};

describe('affected area', () => {
  it('WZ-3: submits the drawn affected area, not the whole parcel boundary', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);

    // The map is seeded with the parcel boundary as its context and is editable.
    expect(screen.getByTestId('map-context')).toHaveTextContent('yes');
    expect(screen.getByTestId('map-context-is-container')).toHaveTextContent('yes');
    expect(screen.getByTestId('map-readonly')).toHaveTextContent('no');

    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await stagePhoto(); // at least one photo is required to submit
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input.geometry).toEqual(AFFECTED_SQUARE);
    // Critically: NOT the parcel boundary.
    expect(input.geometry).not.toEqual(PARCEL_SQUARE);
    expect(input.parcelId).toBe('parcel-1');
  });

  it('WZ-3: submits the parcel boundary when the farmer claims the whole parcel', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);

    await user.click(screen.getByRole('button', { name: /entire parcel/i }).closest('button')!);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input.geometry).toEqual(PARCEL_SQUARE);
  });

  it('WZ-3: never sends a client-computed acreage', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('claimedAreaAcres');
    expect(input).not.toHaveProperty('areaAcres');
    expect(input).not.toHaveProperty('calculatedAreaAcres');
  });

  it('WZ-3: switches a drawn area back to the whole parcel when re-tapped', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /entire parcel/i }).closest('button')!);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    expect((onCreateClaim.mock.calls[0][0] as ClaimCreateInput).geometry).toEqual(PARCEL_SQUARE);
  });

  it('WZ-3: blocks submission when the farmer erases their drawing instead of claiming the whole parcel', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    // The farmer erases the drawing. The wizard must go back to "no affected area selected" — it
    // must NOT quietly fall back to the parcel boundary, which would inflate a 1.15-acre partial
    // claim into the full 1.25-acre parcel.
    await user.click(screen.getByTestId('map-clear-affected'));

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(onCreateClaim).not.toHaveBeenCalled());
    expect(onSubmitClaim).not.toHaveBeenCalled();
  });
});

describe('submission lifecycle', () => {
  it('moves the draft to submitted — the whole point of the wizard', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ClaimWizard
        parcels={[parcel()]}
        parcelsStatus="ready"
        onRetryParcels={() => {}}
        onCreateClaim={onCreateClaim}
        onUploadEvidence={onUploadEvidence}
        onSubmitClaim={onSubmitClaim}
        onDone={onDone}
        onCancel={() => {}}
      />
    );
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onSubmitClaim).toHaveBeenCalledTimes(1));
    // Submitted against the claim the draft call returned — not a second, separate id — with the
    // x-request-id that ties this browser attempt to the backend's jobs.
    expect(onSubmitClaim).toHaveBeenCalledWith('claim-1', {
      requestId: expect.stringMatching(/^fe_clm_[A-Za-z0-9_-]+_s1$/),
    });
    // Handing the detail view the SUBMITTED claim, never the stale draft object.
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(submittedClaim));
  });

  it('orders create → evidence → submit', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    onCreateClaim.mockImplementation(async () => {
      order.push('create');
      return fakeClaim;
    });
    onUploadEvidence.mockImplementation(async () => {
      order.push('evidence');
      return { uploadId: 'ev-1', status: 'stored' } as never;
    });
    onSubmitClaim.mockImplementation(async () => {
      order.push('submit');
      return submittedClaim;
    });

    renderWizard([parcel()]);
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Stage a photo while still on the evidence step.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => expect(screen.getByText('a.png')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(order).toEqual(['create', 'evidence', 'submit']));
    // The photo is uploaded against the claim the create call returned.
    expect(onUploadEvidence).toHaveBeenCalledWith('claim-1', expect.any(File));
  });

  it('WZ-14: stays on Review with a focused alert when submit fails — never navigates away', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onOpenClaim = vi.fn();
    onSubmitClaim.mockRejectedValue(new ApiClientError(500, 'genericError'));
    render(
      <ClaimWizard
        parcels={[parcel()]}
        parcelsStatus="ready"
        onRetryParcels={() => {}}
        onCreateClaim={onCreateClaim}
        onUploadEvidence={onUploadEvidence}
        onSubmitClaim={onSubmitClaim}
        onDone={onDone}
        onOpenClaim={onOpenClaim}
        onCancel={() => {}}
      />
    );
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your claim is saved but not submitted yet');
    // A 500 is not retried automatically.
    expect(onSubmitClaim).toHaveBeenCalledTimes(1);
    // The draft exists, so the farmer can open it — but nothing navigates on its own.
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review your claim' })).toBeInTheDocument();
    // Never claim success when the submit failed.
    expect(toast.success).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: 'Open saved claim' }));
    expect(onOpenClaim).toHaveBeenCalledWith('claim-1');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('never re-uploads evidence that already completed on a previous attempt', async () => {
    const user = userEvent.setup();
    onSubmitClaim.mockRejectedValue(new ApiClientError(500, 'genericError'));

    renderWizard([parcel()]);
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Now on the evidence step — stage a photo through the real file input.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput, {
      target: {
        files: [new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => expect(screen.getByText('a.png')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalledTimes(1));

    // Retry the wizard submit: the same evidence must not be presigned/uploaded twice.
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onSubmitClaim).toHaveBeenCalledTimes(2));
    expect(onUploadEvidence).toHaveBeenCalledTimes(1);
  });
});

describe('parcels without a usable boundary', () => {
  it('blocks the wizard when no parcel has a drawable boundary', async () => {
    renderWizard([legacyParcel()]);
    expect(await screen.findByText('No parcel with a boundary')).toBeInTheDocument();
    // Nothing is selected, so the wizard cannot advance past the parcel step.
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('offers a legacy parcel as disabled instead of selecting it', async () => {
    // Two usable parcels are supplied so the single-parcel auto-select (which also advances the
    // wizard past this step) does not fire and hide the list.
    renderWizard([
      legacyParcel({ name: 'Legacy Field' }),
      parcel({ parcelId: 'parcel-2', name: 'South Field' }),
      parcel({ parcelId: 'parcel-3', name: 'East Field' }),
    ]);

    await screen.findByText('Legacy Field');
    const legacyRow = screen.getByText('Legacy Field').closest('button');
    expect(legacyRow).toBeDisabled();

    // The usable parcels are selectable.
    expect(screen.getByText('South Field').closest('button')).toBeEnabled();
    expect(screen.getByText('East Field').closest('button')).toBeEnabled();

    // Nothing is selected yet, so the wizard still waits for an explicit choice.
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });
});

describe('claimant relationship step (optional)', () => {
  const walkToSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i })); // → evidence
    await stagePhoto();
    await user.click(screen.getByRole('button', { name: /continue/i })); // → review
  };

  it('follows the parcel step and sends the chosen relationship on create', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    // The single parcel is auto-selected, which lands the farmer on the relationship question.
    expect(await screen.findByText('How are you related to this land?')).toBeInTheDocument();
    // Optional: Continue is available before answering.
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();

    const tenant = screen.getByRole('button', { name: /lease \(tenant\)/i });
    await user.click(tenant);
    expect(tenant).toHaveAttribute('aria-pressed', 'true');

    await walkToSubmit(user);
    // The review step repeats the answer.
    expect(screen.getByText('I farm it on lease (tenant)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input.claimantRelationship).toBe('tenant');
  });

  it('omits claimantRelationship entirely when the farmer skips the question', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);
    await screen.findByText('How are you related to this land?');

    await walkToSubmit(user);
    expect(screen.getByText('Not given')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input).not.toHaveProperty('claimantRelationship');
  });

  it('clears the answer when the selected option is tapped again', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);
    await screen.findByText('How are you related to this land?');

    const owner = screen.getByRole('button', { name: /i own this land/i });
    await user.click(owner);
    expect(owner).toHaveAttribute('aria-pressed', 'true');
    await user.click(owner);
    expect(owner).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Five-step wizard (plan B3): WZ-* in the acceptance matrix ──────────────────────────────────

const onUploadDocumentFile = vi.fn();
const onAttachDocument = vi.fn();
const onDeleteEvidence = vi.fn();

type WizardProps = Parameters<typeof ClaimWizard>[0];

const renderFull = (overrides: Partial<WizardProps> = {}, parcels: ParcelRecord[] = [parcel()]) =>
  render(
    <ClaimWizard
      parcels={parcels}
      parcelsStatus="ready"
      onRetryParcels={() => {}}
      onCreateClaim={onCreateClaim}
      onUploadEvidence={onUploadEvidence}
      onSubmitClaim={onSubmitClaim}
      onUploadDocumentFile={onUploadDocumentFile}
      onAttachDocument={onAttachDocument}
      onDeleteEvidence={onDeleteEvidence}
      onDone={() => {}}
      onOpenClaim={() => {}}
      onCancel={() => {}}
      {...overrides}
    />
  );

const continueButton = () => screen.getByRole('button', { name: /continue/i });
const submitButton = () => screen.getByRole('button', { name: /submit/i });

/** Parcel (auto) → Your land (optionally answered) → Event (flood, 3 days ago, whole parcel) → Evidence. */
const toEvidence = async (user: ReturnType<typeof userEvent.setup>, relationship?: RegExp) => {
  if (relationship) await user.click(await screen.findByRole('button', { name: relationship }));
  await advanceToAreaStep(user);
  await user.click(continueButton());
  await screen.findByRole('heading', { name: 'Photos and land documents' });
};

const toReview = async (user: ReturnType<typeof userEvent.setup>, photos: string[] = ['a.png']) => {
  await toEvidence(user);
  await stagePhoto(...photos);
  await user.click(continueButton());
  await screen.findByRole('heading', { name: 'Review your claim' });
};

const stageDocument = (...names: string[]) => {
  fireEvent.change(screen.getByTestId('wizard-document-input'), { target: { files: names.map(pngFile) } });
};

beforeEach(() => {
  onUploadDocumentFile.mockImplementation(async (file: File) => ({ uploadId: `up_${file.name}` }));
  onAttachDocument.mockImplementation(async (_claimId: string, input: { uploadId: string }) => ({ id: `own_${input.uploadId}` }));
  onDeleteEvidence.mockResolvedValue({ deleted: true });
});

describe('five-step wizard: steps and gating', () => {
  it('WZ-1: shows five steps, marks the current one, and moves focus to each new step heading', async () => {
    const user = userEvent.setup();
    renderFull();
    const rail = await screen.findByRole('list', { name: 'Claim steps' });
    const steps = within(rail).getAllByRole('listitem');
    expect(steps.map((li) => li.textContent?.split(' — ')[0])).toEqual(['Parcel', 'Your land', 'Event', 'Evidence', 'Review']);
    // The single parcel was auto-selected, so "Your land" is current.
    await waitFor(() => expect(steps[1]).toHaveAttribute('aria-current', 'step'));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'How are you related to this land?' })).toHaveFocus());

    await user.click(continueButton());
    expect(screen.getByRole('heading', { name: 'What happened?' })).toHaveFocus();
    // The footer is pinned to the bottom of a phone screen.
    expect(screen.getByTestId('wizard-footer').className).toMatch(/\bsticky bottom-0\b/);
    expect(screen.getByTestId('wizard-footer').className).toMatch(/\bsm:static\b/);
  });

  it('WZ-2: the Event step asks for type, date and area together and lists what is missing', async () => {
    const user = userEvent.setup();
    renderFull();
    await screen.findByRole('heading', { name: 'How are you related to this land?' });
    await user.click(continueButton());

    expect(continueButton()).toBeDisabled();
    const hint = screen.getByTestId('event-missing-hint');
    expect(hint).toHaveTextContent('Choose what caused the damage.');
    expect(hint).toHaveTextContent('Choose the date it happened (within the last 30 days).');
    // The whole parcel is the starting area, so the area is not missing.
    expect(hint).not.toHaveTextContent('Choose the affected area');
    expect(hint.parentElement).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: /^flood$/i }));
    expect(screen.getByTestId('event-missing-hint')).not.toHaveTextContent('Choose what caused the damage.');
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) },
    });
    expect(screen.queryByTestId('event-missing-hint')).not.toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // Clearing the drawn area blocks the step again and says so.
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByTestId('map-clear-affected'));
    expect(continueButton()).toBeDisabled();
    expect(screen.getByTestId('event-missing-hint')).toHaveTextContent('Choose the affected area');
  });

  it('WZ-4: at least one photo is required; at most ten are accepted', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user);
    expect(continueButton()).toBeDisabled();
    expect(screen.getByTestId('evidence-missing-hint')).toHaveTextContent('Add at least one photo of the damaged crop.');

    // Nine photos first: no limit message yet.
    const first = Array.from({ length: 9 }, (_, i) => `p${i + 1}.png`);
    fireEvent.change(screen.getByTestId('wizard-photo-input'), { target: { files: first.map(pngFile) } });
    await waitFor(() => expect(screen.getAllByTestId('wizard-photo')).toHaveLength(9));
    expect(screen.getByTestId('wizard-photo-messages')).toBeEmptyDOMElement();
    expect(continueButton()).toBeEnabled();

    // Then three more: only one fits, and the farmer is told. (The old check counted against the
    // draft as it was when the handler started, so nothing was said and photos vanished silently.)
    fireEvent.change(screen.getByTestId('wizard-photo-input'), {
      target: { files: ['p10.png', 'p11.png', 'p12.png'].map(pngFile) },
    });
    await waitFor(() => expect(screen.getByTestId('wizard-photo-messages')).toHaveTextContent('Only 10 photos can be added.'));
    expect(screen.getAllByTestId('wizard-photo')).toHaveLength(10);
    expect(screen.getByText('p10.png')).toBeInTheDocument();
    expect(screen.queryByText('p11.png')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeDisabled();
    expect(screen.getByText('10 of 10 photos')).toBeInTheDocument();
    expect(screen.getByText(/You have added 10 photos, the most allowed/)).toBeInTheDocument();
  });

  it('WZ-4: thumbnails use object URLs that are released on remove and on unmount', async () => {
    const created: string[] = [];
    const createObjectURL = vi.fn((file: File) => {
      const url = `blob:${file.name}`;
      created.push(url);
      return url;
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    try {
      const user = userEvent.setup();
      const view = renderFull();
      await toEvidence(user);
      await stagePhoto('a.png', 'b.png');
      expect(screen.getByRole('img', { name: 'Preview of a.png' })).toHaveAttribute('src', 'blob:a.png');
      expect(created).toEqual(['blob:a.png', 'blob:b.png']);

      await user.click(screen.getByRole('button', { name: 'Remove photo a.png' }));
      expect(screen.queryByText('a.png')).not.toBeInTheDocument();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:b.png');

      view.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:b.png');
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('WZ-5: a file that is not a usable image is refused with an inline message, not only a toast', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user);
    mockValidateImageFile.mockImplementation(async (file: File) => {
      if (file.name.endsWith('.pdf') || file.name === 'notes.txt') throw { key: 'unsupportedImage' };
      if (file.name === 'huge.png') throw { key: 'imageTooLarge' };
      return { type: 'png' as const };
    });
    fireEvent.change(screen.getByTestId('wizard-photo-input'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' }), pngFile('huge.png'), pngFile('ok.png')] },
    });
    const messages = await screen.findByTestId('wizard-photo-messages');
    await waitFor(() => expect(messages).toHaveTextContent('"notes.txt" was not added.'));
    expect(messages).toHaveTextContent('"huge.png" was not added.');
    expect(messages).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('ok.png')).toBeInTheDocument();
    expect(screen.getAllByTestId('wizard-photo')).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();

    // A PDF land document gets the "images only" reason.
    stageDocument();
    fireEvent.change(screen.getByTestId('wizard-document-input'), {
      target: { files: [new File(['%PDF'], 'patta.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() =>
      expect(screen.getByTestId('wizard-document-messages')).toHaveTextContent(
        '"patta.pdf" was not added. Please add a photo (JPG, PNG or WebP) of the document. PDF files cannot be added yet.'
      )
    );
    expect(screen.queryAllByTestId('wizard-document')).toHaveLength(0);
  });

  it('WZ-6: a tenant sees two document groups; each new document defaults to the first missing one', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user, /lease \(tenant\)/i);

    const groups = within(screen.getByTestId('wizard-document-groups')).getAllByRole('listitem');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.getAttribute('data-satisfied'))).toEqual(['false', 'false']);
    expect(groups[0]).toHaveTextContent('Lease agreement');
    expect(groups[1]).toHaveTextContent('Land record (patta / chitta) or Ownership deed or Land tax receipt');

    stageDocument('lease.png');
    const first = await screen.findByRole('combobox', { name: 'Document type for lease.png' });
    expect(first).toHaveValue('lease_agreement');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('wizard-document-groups')).getAllByRole('listitem').map((g) => g.getAttribute('data-satisfied'))
      ).toEqual(['true', 'false'])
    );

    stageDocument('patta.png');
    expect(await screen.findByRole('combobox', { name: 'Document type for patta.png' })).toHaveValue('land_record');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('wizard-document-groups')).getAllByRole('listitem').map((g) => g.getAttribute('data-satisfied'))
      ).toEqual(['true', 'true'])
    );

    // The farmer can correct a category before submitting.
    await user.selectOptions(first, 'other');
    expect(first).toHaveValue('other');
    expect(within(screen.getByTestId('wizard-document-groups')).getAllByRole('listitem')[0]).toHaveAttribute('data-satisfied', 'false');

    // Documents are optional and capped at five.
    expect(continueButton()).toBeDisabled(); // no photo yet — documents never replace photos
    stageDocument('d3.png', 'd4.png', 'd5.png', 'd6.png');
    await waitFor(() => expect(screen.getAllByTestId('wizard-document')).toHaveLength(5));
    expect(screen.getByTestId('wizard-document-messages')).toHaveTextContent('Only 5 land documents can be added here.');
    expect(screen.getByRole('button', { name: 'Add land document' })).toBeDisabled();
  });

  it('WZ-7: without a relationship, generic document guidance is shown instead of groups', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user);
    expect(screen.queryByTestId('wizard-document-groups')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-document-generic')).toHaveTextContent(
      'Add a photo of your land record (patta / chitta) or ownership deed.'
    );
    expect(screen.getByText(/You can submit without them/)).toBeInTheDocument();
    stageDocument('deed.png');
    expect(await screen.findByRole('combobox', { name: 'Document type for deed.png' })).toHaveValue('land_record');
  });

  it('WZ-8: says that automatic reading is not an official government verification', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user);
    expect(screen.getByTestId('wizard-documents-ai-note')).toHaveTextContent(
      'Automatic reading is not an official government verification.'
    );
    await stagePhoto();
    await user.click(continueButton());
    expect(screen.getByText(/Photos and documents may be read automatically/)).toHaveTextContent(
      'Automatic reading is not an official government verification.'
    );
    expect(screen.getByText(/Checks start automatically after you submit/)).toBeInTheDocument();
  });
});

describe('five-step wizard: review', () => {
  it('WZ-9: the review lists every answer with Edit links that open the step', async () => {
    const user = userEvent.setup();
    renderFull();
    await toEvidence(user, /i own this land/i);
    await stagePhoto('a.png', 'b.png');
    stageDocument('patta.png');
    await screen.findByText('patta.png');
    await user.click(continueButton());

    expect(screen.getByTestId('review-parcel')).toHaveTextContent('North Field');
    expect(screen.getByTestId('review-parcel')).toHaveTextContent('Paddy');
    expect(screen.getByTestId('review-relationship')).toHaveTextContent('I own this land');
    expect(screen.getByTestId('review-event')).toHaveTextContent('Flood');
    expect(screen.getByTestId('review-event')).toHaveTextContent('1.25 acres');
    expect(screen.getByTestId('review-event')).toHaveTextContent('You are claiming the entire parcel boundary.');
    expect(screen.getByTestId('review-photos')).toHaveTextContent('2 photo(s)');
    expect(screen.getByTestId('review-photos')).toHaveTextContent('a.png');
    expect(screen.getByTestId('review-documents')).toHaveTextContent('patta.png');
    expect(screen.getByTestId('review-documents')).toHaveTextContent('Land record (patta / chitta)');
    expect(screen.getByTestId('review-state')).toHaveTextContent('Looks correct — submit when ready.');

    for (const section of ['Parcel', 'Your relation to the land', 'Event', 'Photos', 'Land documents']) {
      expect(screen.getByRole('button', { name: `Edit ${section}` })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Edit Event' }));
    expect(screen.getByRole('heading', { name: 'What happened?' })).toHaveFocus();
    // Already reached: straight back to Review through the steps in between.
    await user.click(continueButton());
    await user.click(continueButton());
    expect(screen.getByRole('heading', { name: 'Review your claim' })).toHaveFocus();
  });

  it('WZ-9: once the claim is saved, only the evidence can still be edited', async () => {
    const user = userEvent.setup();
    onUploadEvidence.mockRejectedValueOnce(new ApiClientError(500, 'genericError'));
    renderFull();
    await toReview(user);
    await user.click(submitButton());
    await screen.findByRole('alert');

    expect(screen.getByText(/This claim is already saved/)).toBeInTheDocument();
    for (const section of ['Parcel', 'Your relation to the land', 'Event']) {
      expect(screen.queryByRole('button', { name: `Edit ${section}` })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Edit Photos' })).toBeInTheDocument();
  });
});

describe('five-step wizard: submission', () => {
  it('WZ-10: create → photos → (upload, attach) per document → submit → done', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const onDone = vi.fn();
    onCreateClaim.mockImplementation(async () => {
      order.push('create');
      return fakeClaim;
    });
    onUploadEvidence.mockImplementation(async (_id: string, file: File) => {
      order.push(`photo:${file.name}`);
      return { uploadId: `img_${file.name}` } as never;
    });
    onUploadDocumentFile.mockImplementation(async (file: File) => {
      order.push(`upload:${file.name}`);
      return { uploadId: `up_${file.name}` };
    });
    onAttachDocument.mockImplementation(async (_id: string, input: { uploadId: string; documentCategory?: string }) => {
      order.push(`attach:${input.uploadId}:${input.documentCategory}`);
      return { id: `own_${input.uploadId}` };
    });
    onSubmitClaim.mockImplementation(async () => {
      order.push('submit');
      return submittedClaim;
    });

    renderFull({ onDone }, [parcel()]);
    await toEvidence(user, /lease \(tenant\)/i);
    await stagePhoto('a.png', 'b.png');
    stageDocument('lease.png');
    await screen.findByText('lease.png');
    stageDocument('patta.png');
    await screen.findByText('patta.png');
    await user.click(continueButton());
    await user.click(submitButton());

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(submittedClaim));
    expect(order).toEqual([
      'create',
      'photo:a.png',
      'photo:b.png',
      'upload:lease.png',
      'attach:up_lease.png:lease_agreement',
      'upload:patta.png',
      'attach:up_patta.png:land_record',
      'submit',
    ]);
    expect(onAttachDocument).toHaveBeenCalledWith('claim-1', { uploadId: 'up_lease.png', documentCategory: 'lease_agreement' });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('WZ-10: shows what is happening while it submits, without percentages', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    onUploadEvidence.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderFull();
    await toReview(user, ['a.png', 'b.png']);
    await user.click(submitButton());

    const status = await screen.findByTestId('submission-status');
    expect(status).toHaveAttribute('role', 'status');
    await waitFor(() => expect(status).toHaveAttribute('data-phase', 'photos'));
    expect(status).toHaveTextContent('Upload photos');
    expect(status).toHaveTextContent('0 of 2');
    expect(status).not.toHaveTextContent('%');
    expect(submitButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await act(async () => release({ uploadId: 'img_a' }));
    await waitFor(() => expect(status).toHaveTextContent('1 of 2'));
    await act(async () => release({ uploadId: 'img_b' }));
    await waitFor(() => expect(screen.queryByTestId('submission-status')).not.toBeInTheDocument());
  });

  it('WZ-11: a double click starts exactly one create and one submit', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderFull({ onDone });
    await toReview(user);
    const button = submitButton();
    // Two synchronous clicks: the second lands before React re-renders the disabled button.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onCreateClaim).toHaveBeenCalledTimes(1);
    expect(onUploadEvidence).toHaveBeenCalledTimes(1);
    expect(onSubmitClaim).toHaveBeenCalledTimes(1);
  });

  it('WZ-12: a failed photo stops before submit; Retry re-uploads only that photo, then submits', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    onUploadEvidence.mockImplementation(async (_id: string, file: File) => {
      if (file.name === 'b.png' && onUploadEvidence.mock.calls.filter((c) => (c[1] as File).name === 'b.png').length === 1) {
        throw new ApiClientError(500, 'genericError');
      }
      return { uploadId: `img_${file.name}` } as never;
    });
    renderFull({ onDone });
    await toReview(user, ['a.png', 'b.png', 'c.png']);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Some photos could not be uploaded');
    expect(alert).toHaveTextContent('Retry the items marked as failed');
    expect(within(alert).getByText('Some photos could not be uploaded')).toHaveFocus();
    expect(onSubmitClaim).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onUploadEvidence.mock.calls.map((c) => (c[1] as File).name)).toEqual(['a.png', 'b.png', 'c.png']);

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(submittedClaim));
    // Only the failed photo went again; the claim was not created twice.
    expect(onUploadEvidence.mock.calls.map((c) => (c[1] as File).name)).toEqual(['a.png', 'b.png', 'c.png', 'b.png']);
    expect(onCreateClaim).toHaveBeenCalledTimes(1);
    expect(onSubmitClaim).toHaveBeenCalledTimes(1);
  });

  it('WZ-12: a failed photo can be retried on its own from the Evidence step', async () => {
    const user = userEvent.setup();
    onUploadEvidence.mockImplementation(async (_id: string, file: File) => {
      if (file.name === 'b.png' && onUploadEvidence.mock.calls.filter((c) => (c[1] as File).name === 'b.png').length === 1) {
        throw new ApiClientError(503, 'serviceBusy');
      }
      return { uploadId: `img_${file.name}` } as never;
    });
    renderFull();
    await toReview(user, ['a.png', 'b.png']);
    await user.click(submitButton());
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Edit Photos' }));
    const failed = screen.getAllByTestId('wizard-photo').find((li) => li.textContent?.includes('b.png'))!;
    expect(failed).toHaveAttribute('data-status', 'failed');
    await user.click(within(failed).getByRole('button', { name: 'Retry uploading b.png' }));
    await waitFor(() => expect(failed).toHaveAttribute('data-status', 'uploaded'));
    expect(onUploadEvidence).toHaveBeenCalledTimes(3);
    // Nothing failed any more, so the banner goes; nothing was submitted yet.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onSubmitClaim).not.toHaveBeenCalled();
  });

  it('WZ-13: when attaching a document fails, Retry attaches it again without re-uploading', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    onAttachDocument
      .mockImplementationOnce(async () => {
        throw new ApiClientError(500, 'genericError');
      })
      .mockImplementation(async (_id: string, input: { uploadId: string }) => ({ id: `own_${input.uploadId}` }));
    renderFull({ onDone });
    await toEvidence(user);
    await stagePhoto();
    stageDocument('patta.png');
    await screen.findByText('patta.png');
    await user.click(continueButton());
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Some land documents could not be added');
    expect(onSubmitClaim).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onUploadDocumentFile).toHaveBeenCalledTimes(1);
    expect(onAttachDocument).toHaveBeenCalledTimes(2);
    expect(onAttachDocument.mock.calls[1]).toEqual(['claim-1', { uploadId: 'up_patta.png', documentCategory: 'land_record' }]);
    expect(onUploadEvidence).toHaveBeenCalledTimes(1);
  });

  it('WZ-14: a 503 on submit is retried once automatically; then the alert stays and nothing navigates', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    onSubmitClaim.mockRejectedValue(new ApiClientError(503, 'serviceBusy'));
    renderFull({ onDone });
    await toReview(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(onSubmitClaim).toHaveBeenCalledTimes(2);
    expect(onSubmitClaim.mock.calls.map((c) => (c[1] as { requestId: string }).requestId.slice(-3))).toEqual(['_s1', '_s2']);
    expect(alert).toHaveTextContent('Your claim is saved, but the checks could not be started yet. Tap Retry.');
    expect(within(alert).getByRole('button', { name: 'Open saved claim' })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review your claim' })).toBeInTheDocument();

    // Retry: the claim is not created again and the attempt numbers continue.
    onSubmitClaim.mockResolvedValueOnce(submittedClaim);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(submittedClaim));
    expect(onCreateClaim).toHaveBeenCalledTimes(1);
    expect((onSubmitClaim.mock.calls[2][1] as { requestId: string }).requestId.endsWith('_s3')).toBe(true);
  }, 10_000);

  it('WZ-15: a 401 shows the sign-in message and releases the lock for the next attempt', async () => {
    const user = userEvent.setup();
    onCreateClaim.mockRejectedValueOnce(new ApiClientError(401, 'authExpired'));
    renderFull();
    await toReview(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication expired. Please sign in again.');
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSubmitClaim).toHaveBeenCalledTimes(1));
  });

  it('WZ-16: removing a photo already stored on the saved claim asks first, then deletes it', async () => {
    const user = userEvent.setup();
    onUploadEvidence.mockImplementation(async (_id: string, file: File) => {
      if (file.name === 'b.png') throw new ApiClientError(500, 'genericError');
      return { uploadId: 'ev-server-1' } as never;
    });
    renderFull();
    await toReview(user, ['a.png', 'b.png']);
    await user.click(submitButton());
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Edit Photos' }));

    // Cancel first: nothing is deleted.
    await user.click(screen.getByRole('button', { name: 'Remove photo a.png' }));
    expect(await screen.findByRole('dialog', { name: 'Remove this uploaded photo?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDeleteEvidence).not.toHaveBeenCalled();
    expect(screen.getByText('a.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove photo a.png' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(onDeleteEvidence).toHaveBeenCalledWith('claim-1', 'ev-server-1'));
    await waitFor(() => expect(screen.queryByText('a.png')).not.toBeInTheDocument());

    // A photo that never reached the server is removed without a call.
    await user.click(screen.getByRole('button', { name: 'Remove photo b.png' }));
    expect(onDeleteEvidence).toHaveBeenCalledTimes(1);
  });
});

describe('five-step wizard: draft persistence', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('sessionStorage', storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('WZ-17: the idempotency key is stable across retries and across a restored draft', async () => {
    const user = userEvent.setup();
    onCreateClaim.mockRejectedValue(new ApiClientError(429, 'rateLimited'));
    const first = renderFull({ draftOwner: 'sub-1' });
    await toReview(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached the hourly limit for claim actions.');
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(2));
    const key = (onCreateClaim.mock.calls[0][0] as ClaimCreateInput).idempotencyKey;
    expect((onCreateClaim.mock.calls[1][0] as ClaimCreateInput).idempotencyKey).toBe(key);

    // Leave and come back (a reload or a trip to the list): the draft is restored, the photo
    // must be chosen again, and the same key is sent.
    first.unmount();
    expect(storage.getItem('vivasayi.claimDraft.v1:sub-1')).not.toBeNull();
    onCreateClaim.mockReset();
    onCreateClaim.mockResolvedValue(fakeClaim);
    const onDone = vi.fn();
    renderFull({ draftOwner: 'sub-1', onDone });

    const notice = await screen.findByTestId('wizard-draft-restored');
    expect(notice).toHaveTextContent('We restored your draft');
    expect(notice).toHaveTextContent('Photos and documents that were not uploaded must be added again.');
    expect(screen.getByRole('heading', { name: 'Photos and land documents' })).toBeInTheDocument();
    const photo = screen.getByTestId('wizard-photo');
    expect(photo).toHaveAttribute('data-status', 'missing_file');
    expect(continueButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Choose a.png again' }));
    fireEvent.change(screen.getByTestId('wizard-replace-input'), { target: { files: [pngFile('a.png')] } });
    await waitFor(() => expect(screen.getByTestId('wizard-photo')).toHaveAttribute('data-status', 'staged'));
    await user.click(continueButton());
    await user.click(submitButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(submittedClaim));
    expect((onCreateClaim.mock.calls[0][0] as ClaimCreateInput).idempotencyKey).toBe(key);
    // Cleared once submitted.
    expect(storage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
  });

  it('WZ-17: Start over asks first, then clears the saved draft and begins again', async () => {
    const user = userEvent.setup();
    const first = renderFull({ draftOwner: 'sub-1' });
    await toEvidence(user, /i own this land/i);
    first.unmount();

    renderFull({ draftOwner: 'sub-1' });
    await screen.findByTestId('wizard-draft-restored');
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start over?' });
    expect(dialog).toHaveTextContent('Everything you entered in this form will be cleared.');
    await user.click(within(dialog).getByRole('button', { name: 'Clear and start over' }));

    expect(screen.queryByTestId('wizard-draft-restored')).not.toBeInTheDocument();
    expect(storage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
    // A fresh draft: the single parcel is picked again and the relationship is unanswered.
    expect(await screen.findByRole('heading', { name: 'How are you related to this land?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i own this land/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('WZ-17: nothing is stored without a signed-in user, and an untouched wizard stores nothing', async () => {
    const user = userEvent.setup();
    const anonymous = renderFull({ draftOwner: null });
    await toEvidence(user);
    anonymous.unmount();
    expect(storage.length).toBe(0);

    const untouched = renderFull({ draftOwner: 'sub-1' });
    await screen.findByRole('heading', { name: 'How are you related to this land?' });
    untouched.unmount();
    expect(storage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
  });
});
