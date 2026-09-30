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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stand-in map. `drawAffected` emits a polygon strictly INSIDE the parcel boundary, which is what
// lets these tests tell an affected area apart from the whole parcel.
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
    </div>
  ),
}));

import { ClaimWizard } from './ClaimWizard';
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

const renderWizard = (parcels: ParcelRecord[]) =>
  render(
    <ClaimWizard
      parcels={parcels}
      parcelsStatus="ready"
      onRetryParcels={() => {}}
      onCreateClaim={onCreateClaim}
      onUploadEvidence={async () => {}}
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

beforeEach(() => {
  vi.clearAllMocks();
  onCreateClaim.mockResolvedValue(fakeClaim);
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
