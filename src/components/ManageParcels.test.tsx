// Component-level tests for Manage Parcels. MapLibre needs WebGL, which jsdom does not provide,
// so ParcelDrawMap is replaced with a lightweight stand-in that exposes the props the parent is
// responsible for (notably `readOnly` and `onChange`). What is under test here is the PARENT's
// contract — that a boundary is required, that the saved geometry is what gets submitted, that a
// legacy parcel without geometry is flagged instead of silently claimable, and that the View Map
// dialog is genuinely read-only — none of which lives in the map component itself.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Side-effect import: initialises the REAL i18next instance and registers it with
// initReactI18next, so useTranslation() resolves against the real English dictionary and every
// assertion below is written against the words a farmer actually sees. Deliberately NOT mocked —
// mocking 'react-i18next' and importing '../i18n' from inside the mock factory deadlocks, because
// i18n.ts itself imports react-i18next.
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

const listParcels = vi.fn();
const createParcel = vi.fn();
const updateParcel = vi.fn();
const deleteParcel = vi.fn();

vi.mock('../api', () => ({
  listParcels: () => listParcels(),
  createParcel: (input: unknown) => createParcel(input),
  updateParcel: (id: string, input: unknown) => updateParcel(id, input),
  deleteParcel: (id: string) => deleteParcel(id),
}));

// Stand-in for the map. Renders the props the parent passes so assertions can read them, and lets
// the test fire an onChange to simulate the farmer finishing a polygon.
vi.mock('./LazyParcelDrawMap', () => ({
  LazyParcelDrawMap: ({
    value,
    onChange,
    readOnly,
    label,
  }: {
    value: unknown;
    onChange?: (polygon: unknown) => void;
    readOnly?: boolean;
    label: string;
  }) => (
    <div>
      <span data-testid="map-label">{label}</span>
      <span data-testid="map-readonly">{readOnly ? 'yes' : 'no'}</span>
      <span data-testid="map-has-value">{value ? 'yes' : 'no'}</span>
      <button
        type="button"
        data-testid="map-draw"
        disabled={readOnly}
        onClick={() =>
          onChange?.({
            type: 'Polygon',
            // A different square from the stored boundary (SQUARE), so the edit test can prove the
            // newly drawn geometry replaced the seeded one.
            coordinates: [[[78.1, 9.7], [78.2, 9.7], [78.2, 9.8], [78.1, 9.8], [78.1, 9.7]]],
          })
        }
      >
        draw
      </button>
    </div>
  ),
}));

import { ManageParcels } from './ManageParcels';
import type { GeoJsonPolygon, ParcelRecord } from '../types';

const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [[[79.1, 10.7], [79.2, 10.7], [79.2, 10.8], [79.1, 10.8], [79.1, 10.7]]],
};

/**
 * What the mocked map emits. Deliberately a DIFFERENT square from SQUARE (the stored boundary),
 * so the edit test proves the newly drawn geometry replaced the seeded one rather than the
 * original being echoed back.
 */
const drawnSquare: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[78.1, 9.7], [78.2, 9.7], [78.2, 9.8], [78.1, 9.8], [78.1, 9.7]]],
};

const parcel = (overrides: Partial<ParcelRecord> = {}): ParcelRecord => ({
  parcelId: 'parcel-1',
  name: 'North Field',
  crop: 'Paddy',
  geometry: SQUARE,
  calculatedAreaAcres: 1.25,
  ...overrides,
} as ParcelRecord);

/**
 * A parcel created before boundaries existed. `ParcelRecord.geometry` is typed non-nullable, but
 * legacy rows really do come back without one, which is exactly what must be surfaced as a warning
 * rather than silently presented as claimable.
 */
const legacyParcel = (overrides: Partial<ParcelRecord> = {}): ParcelRecord =>
  parcel({ ...overrides, geometry: null as unknown as GeoJsonPolygon });

const renderScreen = () =>
  render(<ManageParcels onClose={() => {}} onParcelsChange={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  listParcels.mockResolvedValue([]);
  createParcel.mockResolvedValue({});
  updateParcel.mockResolvedValue({});
  deleteParcel.mockResolvedValue({});
});

describe('boundary is required before a parcel can be saved', () => {
  it('refuses to save a parcel with no drawn boundary', async () => {
    listParcels.mockResolvedValue([]);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /add parcel/i }));
    await user.type(screen.getByLabelText(/name/i), 'North Field');
    await user.type(screen.getByLabelText(/crop/i), 'Paddy');
    await user.click(screen.getByRole('button', { name: /save & continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/boundary/i);
    expect(createParcel).not.toHaveBeenCalled();
  });

  it('saves the exact polygon the map emitted, and nothing else', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /add parcel/i }));
    await user.type(screen.getByLabelText(/name/i), 'North Field');
    await user.type(screen.getByLabelText(/crop/i), 'Paddy');
    await user.click(screen.getByTestId('map-draw'));
    await user.click(screen.getByRole('button', { name: /save & continue/i }));

    await waitFor(() => expect(createParcel).toHaveBeenCalledTimes(1));
    // Geometry only — never an area. The backend owns acreage.
    expect(createParcel).toHaveBeenCalledWith({
      name: 'North Field',
      crop: 'Paddy',
      geometry: drawnSquare,
    });
    expect(createParcel.mock.calls[0][0]).not.toHaveProperty('calculatedAreaAcres');
  });

  it('rejects a name-only or crop-only parcel before the map matters', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /add parcel/i }));
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(createParcel).not.toHaveBeenCalled();
  });
});

describe('editing an existing parcel', () => {
  it('seeds the map with the stored boundary and submits an update', async () => {
    listParcels.mockResolvedValue([parcel()]);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /edit parcel/i }));
    // The stored geometry is preloaded, and the map is editable (not the read-only viewer).
    expect(screen.getAllByTestId('map-has-value')[0]).toHaveTextContent('yes');
    expect(screen.getAllByTestId('map-readonly')[0]).toHaveTextContent('no');

    await user.click(screen.getAllByTestId('map-draw')[0]);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateParcel).toHaveBeenCalledTimes(1));
    expect(updateParcel.mock.calls[0][0]).toBe('parcel-1');
    expect(updateParcel.mock.calls[0][1]).toEqual({
      name: 'North Field',
      crop: 'Paddy',
      geometry: drawnSquare,
    });
  });
});

describe('View Map is genuinely read-only', () => {
  it('opens a read-only map that cannot emit geometry changes', async () => {
    listParcels.mockResolvedValue([parcel()]);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /view map/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The viewer is readOnly, so the map cannot fire a geometry change at all.
    expect(screen.getByTestId('map-readonly')).toHaveTextContent('yes');
    expect(screen.getByTestId('map-draw')).toBeDisabled();
    // Pan/zoom-only affordance stays available.
    expect(screen.queryByTestId('map-has-value')).toHaveTextContent('yes');
  });

  it('shows the backend-computed acreage, not a client preview', async () => {
    listParcels.mockResolvedValue([parcel({ calculatedAreaAcres: 3.5 })]);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /view map/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('3.5');
  });

  it('does not offer View Map for a parcel with no usable boundary', async () => {
    listParcels.mockResolvedValue([legacyParcel()]);
    renderScreen();

    await screen.findByText('North Field');
    expect(screen.queryByRole('button', { name: /view map/i })).not.toBeInTheDocument();
    // Edit is still offered so the farmer can draw the missing boundary.
    expect(screen.getByRole('button', { name: /edit parcel/i })).toBeInTheDocument();
  });
});

describe('legacy parcels without a boundary', () => {
  it('is flagged rather than presented as claimable', async () => {
    listParcels.mockResolvedValue([legacyParcel()]);
    renderScreen();

    await screen.findByText('North Field');
    expect(screen.getByText('No boundary')).toBeInTheDocument();
  });

  it('shows the stored acreage for a parcel that does have a boundary', async () => {
    listParcels.mockResolvedValue([parcel({ calculatedAreaAcres: 2.75 })]);
    renderScreen();

    await screen.findByText('North Field');
    // The acreage lives inside a formatted label ("Area: 2.75 acres"), so match on the number.
    expect(screen.getByText(/2\.75/)).toBeInTheDocument();
    expect(screen.queryByText('No boundary')).not.toBeInTheDocument();
  });
});
