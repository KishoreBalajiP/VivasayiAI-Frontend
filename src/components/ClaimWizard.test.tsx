// Component-level tests for the claim wizard's affected-area step. As in ManageParcels.test.tsx,
// ParcelDrawMap is replaced by a stand-in because MapLibre needs WebGL.
//
// The property under test is the one that matters for money: the polygon the farmer draws on the
// area step is what gets submitted as the claim geometry, it is NOT silently replaced by the full
// parcel boundary, and no acreage is ever sent from the client.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';
import { ApiClientError } from '../api/client';

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
vi.mock('../utils/imageValidation', () => ({
  validateImageFile: async () => ({ type: 'png' as const }),
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
  onCreateClaim.mockResolvedValue(fakeClaim);
  onSubmitClaim.mockResolvedValue(submittedClaim);
  onUploadEvidence.mockResolvedValue({
    uploadId: 'ev-server-1',
    mediaType: 'image/png',
    status: 'stored',
  } as never);
});

/**
 * Walk the wizard forward until the affected-area step is on screen (identified by the map
 * stand-in, which only renders there).
 *
 * This is driven by what is actually on screen rather than a fixed click sequence because the
 * wizard auto-selects the only claimable parcel and may skip past the parcel step entirely. Each
 * pass fills in whatever the current step needs — an event, a date, or nothing at all for the
 * evidence step — then advances. The date is derived from now because the claim window is 30 days.
 */
const advanceToAreaStep = async (user: ReturnType<typeof userEvent.setup>) => {
  const next = () => screen.getByRole('button', { name: /continue/i });
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  for (let guard = 0; guard < 8; guard += 1) {
    if (screen.queryByTestId('map-draw-affected')) return;

    const flood = screen.queryByRole('button', { name: /^flood$/i });
    if (flood) await user.click(flood);

    const dateInput = document.querySelector('input[type="date"]');
    if (dateInput) fireEvent.change(dateInput, { target: { value: threeDaysAgo } });

    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
  }

  throw new Error('wizard never reached the affected-area step');
};

describe('affected area', () => {
  it('submits the drawn affected area, not the whole parcel boundary', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);

    // The map is seeded with the parcel boundary as its context and is editable.
    expect(screen.getByTestId('map-context')).toHaveTextContent('yes');
    expect(screen.getByTestId('map-context-is-container')).toHaveTextContent('yes');
    expect(screen.getByTestId('map-readonly')).toHaveTextContent('no');

    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input.geometry).toEqual(AFFECTED_SQUARE);
    // Critically: NOT the parcel boundary.
    expect(input.geometry).not.toEqual(PARCEL_SQUARE);
    expect(input.parcelId).toBe('parcel-1');
  });

  it('submits the parcel boundary when the farmer claims the whole parcel', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);

    await user.click(screen.getByRole('button', { name: /entire parcel/i }).closest('button')!);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as ClaimCreateInput;
    expect(input.geometry).toEqual(PARCEL_SQUARE);
  });

  it('never sends a client-computed acreage', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    const input = onCreateClaim.mock.calls[0][0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('claimedAreaAcres');
    expect(input).not.toHaveProperty('areaAcres');
    expect(input).not.toHaveProperty('calculatedAreaAcres');
  });

  it('switches a drawn area back to the whole parcel when re-tapped', async () => {
    const user = userEvent.setup();
    renderWizard([parcel()]);

    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /entire parcel/i }).closest('button')!);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onCreateClaim).toHaveBeenCalledTimes(1));
    expect((onCreateClaim.mock.calls[0][0] as ClaimCreateInput).geometry).toEqual(PARCEL_SQUARE);
  });

  it('blocks submission when the farmer erases their drawing instead of claiming the whole parcel', async () => {
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
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onSubmitClaim).toHaveBeenCalledTimes(1));
    // Submitted against the claim the draft call returned — not a second, separate id.
    expect(onSubmitClaim).toHaveBeenCalledWith('claim-1');
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

  it('hands the draft to the detail view when submit fails, so it is recoverable', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
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
        onCancel={() => {}}
      />
    );
    await advanceToAreaStep(user);
    await user.click(screen.getByTestId('map-draw-affected'));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(fakeClaim));
    // Never claim success when the submit failed.
    expect(toast.success).not.toHaveBeenCalled();
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
