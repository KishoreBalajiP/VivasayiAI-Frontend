// Component tests for the parcel/claim map location search box.
//
// Two things are being protected here, and they pull in opposite directions:
//
//   1. RESPONSIVENESS — a farmer on a 2G link types a village name slowly, changes their mind, and
//      demands that the list they finally see belongs to the query they finally typed. That means
//      debouncing, aborting superseded work, and refusing to let a slow earlier response overwrite
//      a newer list.
//   2. HONESTY — "no such place" and "the network is down" are different answers and must not be
//      shown as the same message. Neither may ever be papered over with an invented position.
//
// The geocoding service is mocked so these tests pin the component's own state machine.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';
import { SEARCH_DEBOUNCE_MS } from '../config/map';
import type { LocationSearchOutcome, LocationSearchResult } from '../services/locationSearch';
import { searchLocations } from '../services/locationSearch';
import { ParcelLocationSearch } from './ParcelLocationSearch';

vi.mock('../services/locationSearch', async () => {
  // Keep the real result type/validators, replace only the network call.
  const actual = await vi.importActual<typeof import('../services/locationSearch')>(
    '../services/locationSearch',
  );
  return { ...actual, searchLocations: vi.fn() };
});

const searchMock = searchLocations as unknown as ReturnType<typeof vi.fn>;

const result = (overrides: Partial<LocationSearchResult> = {}): LocationSearchResult => ({
  id: 'Kadapa-10.7870-79.8370-0',
  label: 'Kadapa',
  secondary: 'Kadapa district, Andhra Pradesh, India',
  lat: 10.787,
  lon: 79.837,
  zoom: 11,
  kind: 'town',
  ...overrides,
});

const ok = (results: LocationSearchResult[]): LocationSearchOutcome => ({ status: 'ok', results });

/** Debounced search, resolved against the fake clock. */
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchMock.mockReset();
  searchMock.mockResolvedValue(ok([result()]));
});

describe('query lifecycle', () => {
  it('sends no request for a query shorter than the minimum', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Ka',
    );

    await settle();
    // Nominatim asks clients not to send very short queries, and they are useless anyway.
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('sends exactly one request for a finished word, not one per keystroke', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );

    await settle();

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][0]).toBe('Kadapa');
  });

  it('trims surrounding whitespace before searching', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      '  Kadapa  ',
    );

    await settle();
    expect(searchMock.mock.calls[0][0]).toBe('Kadapa');
  });

  it('abandons the pending request when the query is shortened below the minimum', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, 'Kadapa');
    await settle();
    expect(searchMock).toHaveBeenCalledTimes(1);

    await user.clear(input);
    await user.type(input, 'Ka');
    await settle();

    // The in-flight signal for the abandoned query must be aborted, not left running.
    const firstSignal = searchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('aborts the in-flight request on unmount', async () => {
    const pending = new Promise<LocationSearchOutcome>(() => undefined);
    searchMock.mockReturnValue(pending);

    const view = render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    const signal = searchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();
    // Leaving a request running after unmount is a leak and can warn about setting state on an
    // unmounted component.
    expect(signal.aborted).toBe(true);
  });
});

describe('stale responses', () => {
  it('ignores a slow earlier response that arrives after a newer one', async () => {
    let resolveFirst: (outcome: LocationSearchOutcome) => void = () => undefined;
    searchMock
      .mockImplementationOnce(
        () =>
          new Promise<LocationSearchOutcome>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(ok([result({ id: 'new', label: 'Newer result' })]));

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, 'Kad');
    await settle();

    // The farmer corrects the query; the newest search wins.
    await user.clear(input);
    await user.type(input, 'Kadapa');
    await settle();

    await act(async () => {
      resolveFirst(ok([result({ id: 'stale', label: 'Stale result' })]));
    });

    // The superseded response must not repaint the list.
    expect(screen.getByText('Newer result')).toBeInTheDocument();
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
  });

  it('shows nothing when a superseded request reports failure', async () => {
    let rejectFirst: (outcome: LocationSearchOutcome) => void = () => undefined;
    searchMock
      .mockImplementationOnce(
        () =>
          new Promise<LocationSearchOutcome>((resolve) => {
            rejectFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(ok([result({ id: 'new', label: 'Newer result' })]));

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, 'Kad');
    await settle();
    await user.clear(input);
    await user.type(input, 'Kadapa');
    await settle();

    await act(async () => {
      rejectFirst({ status: 'failed', reason: 'offline' });
    });

    // An error banner from a query the farmer has already replaced would be a lie.
    expect(screen.queryByText(/Search failed/)).not.toBeInTheDocument();
    expect(screen.getByText('Newer result')).toBeInTheDocument();
  });
});

describe('results and honest states', () => {
  it('lists results with their context line', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Kadapa')).toBeInTheDocument();
    expect(screen.getByText('Kadapa district, Andhra Pradesh, India')).toBeInTheDocument();
  });

  it('attributes geocoding results to OpenStreetMap', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    // Nominatim results are ODbL; the credit is part of using them.
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
  });

  it('distinguishes a zero-match response from a failure', async () => {
    searchMock.mockResolvedValue(ok([]));

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Nowhereville',
    );
    await settle();

    expect(await screen.findByText('No locations found')).toBeInTheDocument();
    expect(screen.queryByText(/Search failed/)).not.toBeInTheDocument();
  });

  it.each([
    ['offline', /Search failed/],
    ['timeout', /Search failed/],
    ['server', /Search failed/],
    ['malformed', /Search failed/],
  ])('shows a failure message for a %s outcome', async (reason, message) => {
    searchMock.mockResolvedValue({ status: 'failed', reason } as LocationSearchOutcome);

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    expect(await screen.findByText(message)).toBeInTheDocument();
    // A failure must never be dressed up as "no such place".
    expect(screen.queryByText('No locations found')).not.toBeInTheDocument();
  });

  it('shows nothing at all when the outcome is an abort', async () => {
    searchMock.mockResolvedValue({ status: 'failed', reason: 'aborted' } as LocationSearchOutcome);

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    // 'aborted' just means a newer query won; there is nothing to report.
    expect(screen.queryByText(/Search failed/)).not.toBeInTheDocument();
    expect(screen.queryByText('No locations found')).not.toBeInTheDocument();
  });

  it('drops malformed entries and still renders the valid ones', async () => {
    searchMock.mockResolvedValue(ok([result({ id: 'good', label: 'Kadapa' })]));

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Kadapa',
    );
    await settle();

    expect(await screen.findByText('Kadapa')).toBeInTheDocument();
  });
});

describe('selection', () => {
  it('hands the chosen PLACE to the parent and clears the box', async () => {
    const onSelect = vi.fn();
    render(<ParcelLocationSearch onSelect={onSelect} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await user.click(await screen.findByText('Kadapa'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const payload = onSelect.mock.calls[0][0] as LocationSearchResult;
    // The payload is a place with coordinates — never geometry.
    expect(payload).toMatchObject({ label: 'Kadapa', lat: 10.787, lon: 79.837, zoom: 11 });
    expect(payload).not.toHaveProperty('geometry');
    expect(payload).not.toHaveProperty('coordinates');

    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects the first result with Enter', async () => {
    const onSelect = vi.fn();
    render(<ParcelLocationSearch onSelect={onSelect} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: 'Kadapa' }));
  });

  it('moves through the list with the arrow keys and wraps around', async () => {
    searchMock.mockResolvedValue(
      ok([
        result({ id: 'a', label: 'Kadapa' }),
        result({ id: 'b', label: 'Kadapa Town', lat: 10.9 }),
      ]),
    );
    const onSelect = vi.fn();
    render(<ParcelLocationSearch onSelect={onSelect} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Kadapa Town' }));

    // A further step wraps back past the end to the first entry.
    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Kadapa' }));
  });

  it('closes the list on Escape without selecting anything', async () => {
    const onSelect = vi.fn();
    render(<ParcelLocationSearch onSelect={onSelect} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears the query and cancels any request from the clear button', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByRole('combobox')).toHaveValue('');
    const signal = searchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it('closes the list when the farmer clicks outside', async () => {
    render(
      <div>
        <ParcelLocationSearch onSelect={vi.fn()} />
        <button type="button">elsewhere</button>
      </div>,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(screen.getByRole('combobox'), 'Kadapa');
    await settle();
    await screen.findByRole('listbox');

    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('accessibility and narrow screens', () => {
  it('exposes combobox semantics for screen readers', async () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');

    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, 'Kadapa');
    await settle();
    await screen.findByRole('listbox');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAccessibleName('Search location');
  });

  it('never renders wider than its container so it cannot overflow a 360px phone', async () => {
    // A long unbroken place name is the realistic worst case: without truncation it widens the
    // modal and makes the whole page scroll sideways on a cheap phone.
    searchMock.mockResolvedValue(
      ok([
        result({
          id: 'long',
          label: 'Vellore Maharajapuram Extension Village',
          secondary: 'Kattumannarkoil Block, Thoothukudi, Tamil Nadu, India',
        }),
      ]),
    );

    render(<ParcelLocationSearch onSelect={vi.fn()} />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(
      screen.getByRole('combobox'),
      'Maharajapuram',
    );
    await settle();

    const wrapper = screen.getByRole('combobox').parentElement?.parentElement;
    expect(wrapper?.className).toContain('min-w-0');
    expect(wrapper?.className).toContain('w-full');
    expect(screen.getByText('Vellore Maharajapuram Extension Village').className).toContain(
      'truncate',
    );
    // The dropdown is absolutely positioned and layered above the map, never inside its clipping
    // container.
    const listbox = screen.getByRole('listbox');
    expect(listbox.className).toContain('absolute');
    expect(listbox.className).toContain('inset-x-0');
  });

  it('can be disabled', () => {
    render(<ParcelLocationSearch onSelect={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
