import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { MIN_SEARCH_QUERY_LENGTH, SEARCH_DEBOUNCE_MS } from '../config/map';
import { searchLocations, type LocationSearchResult } from '../services/locationSearch';

// Location search box rendered ABOVE the parcel / claim map.
//
// Purpose is strictly navigation: selecting a result flies the map to that place so the farmer can
// draw their boundary there. It NEVER produces or edits geometry — `onSelect` hands back only a
// place name and coordinates, and the parent decides what to do with the map view.
//
// Request hygiene (Nominatim's public instance allows roughly one request per second, and the
// farmer may be on a slow link):
//   - keystrokes are debounced by SEARCH_DEBOUNCE_MS, so a full word is one request;
//   - blank and sub-minimum queries never reach the network;
//   - the previous request is aborted when a new one starts, and every response is checked
//     against a monotonically increasing request id, so a slow earlier response can never
//     overwrite a newer result list;
//   - the in-flight request is aborted on unmount.
//
// Layout note: the dropdown is absolutely positioned within this component's own relatively
// positioned wrapper and sits above the map with a high z-index, so it is never clipped by the
// map canvas or the scrollable modal. The wrapper is `w-full` with `min-w-0` and every text node
// truncates, so there is no horizontal overflow at 360px.

export interface ParcelLocationSearchProps {
  /**
   * Called when the farmer picks a result. The payload is a PLACE, not a geometry.
   */
  onSelect: (result: LocationSearchResult) => void;
  /** Disable the box entirely (e.g. while a read-only viewer is not wanted). */
  disabled?: boolean;
}

type SearchStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error';

export const ParcelLocationSearch = ({
  onSelect,
  disabled = false,
}: ParcelLocationSearchProps) => {
  const { t } = useTranslation();
  const listId = useId();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const abortRef = useRef<AbortController | null>(null);
  /** Monotonic id; only the newest response is allowed to update state. */
  const requestIdRef = useRef(0);

  // Abort any in-flight request when the component goes away.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Close the dropdown on an outside click (mousedown fires before the input's focus handler).
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const runSearch = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();

    // Cancel whatever was in flight and invalidate its result.
    abortRef.current?.abort();
    abortRef.current = null;

    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      requestIdRef.current += 1;
      setResults([]);
      setStatus('idle');
      setHighlighted(-1);
      setOpen(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('searching');
    setOpen(true);

    const outcome = await searchLocations(trimmed, { signal: controller.signal });

    // A newer request (or an unmount/clear) has superseded this one: drop the response silently
    // rather than letting a stale list overwrite fresher results.
    if (requestIdRef.current !== requestId) return;

    if (outcome.status === 'failed') {
      // 'aborted' means a newer query won the race — that is not a failure the farmer caused, so
      // show nothing rather than an error banner.
      if (outcome.reason === 'aborted') return;
      setResults([]);
      setStatus('error');
      setHighlighted(-1);
      return;
    }

    // A successful response with no matches is genuinely "no such place", which is different from
    // the failure path above and gets its own message.
    setResults(outcome.results);
    setStatus(outcome.results.length > 0 ? 'results' : 'empty');
    setHighlighted(-1);
  }, []);

  // Debounce: one request per pause in typing, never one per keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      // Short input: cancel in flight work without waiting for the debounce.
      abortRef.current?.abort();
      requestIdRef.current += 1;
      setResults([]);
      setStatus('idle');
      setHighlighted(-1);
      setOpen(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      void runSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const closeAndReset = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setQuery('');
    setResults([]);
    setStatus('idle');
    setHighlighted(-1);
    setOpen(false);
  }, []);

  const choose = useCallback(
    (result: LocationSearchResult) => {
      // Hand the PLACE to the parent. No geometry is created or modified anywhere in here.
      onSelectRef.current(result);
      setQuery('');
      setResults([]);
      setStatus('idle');
      setHighlighted(-1);
      setOpen(false);
      inputRef.current?.focus();
    },
    [],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
      return;
    }
    if (status !== 'results' || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const index = highlighted >= 0 ? highlighted : 0;
      const chosen = results[index];
      if (chosen) choose(chosen);
    }
  };

  const showClear = query.length > 0;
  const searching = status === 'searching';
  const messageId = `${listId}-status`;

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      <label htmlFor={`${listId}-input`} className="sr-only">
        {t('locationSearchLabel')}
      </label>
      <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={messageId}
          aria-activedescendant={
            highlighted >= 0 ? `${listId}-option-${highlighted}` : undefined
          }
          value={query}
          disabled={disabled}
          placeholder={t('locationSearchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          className="w-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
        {searching && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" aria-hidden="true" />
        )}
        {showClear && !searching && (
          <button
            type="button"
            onClick={closeAndReset}
            aria-label={t('locationSearchClear')}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/*
        Live region for the spinner only. The empty/error messages below are already rendered
        visibly with `role="alert"`; repeating them here would make a screen reader announce the
        same sentence twice.
      */}
      <p id={messageId} role="status" aria-live="polite" className="sr-only">
        {searching ? t('locationSearching') : ''}
      </p>

      {open && status === 'error' && (
        <p
          role="alert"
          className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {t('locationSearchFailed')}
        </p>
      )}

      {open && status === 'empty' && (
        <p
          role="alert"
          className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {t('locationNoResults')}
        </p>
      )}

      {open && status === 'results' && (
        <>
          <ul
            id={listId}
            role="listbox"
            aria-label={t('locationSearchResultsLabel')}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {results.map((result, index) => (
              <li key={result.id}>
                <button
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={highlighted === index}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => choose(result)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                    highlighted === index ? 'bg-emerald-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {result.label}
                    </span>
                    {result.secondary && (
                      <span className="block truncate text-xs text-gray-500">
                        {result.secondary}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* ODbL attribution for geocoding results, distinct from the tile attribution. */}
          <p className="absolute inset-x-0 top-full z-30 mt-1 rounded-b-xl bg-white/90 px-3 pb-1 pt-0.5 text-[10px] text-gray-400">
            {t('locationSearchAttribution')}
          </p>
        </>
      )}
    </div>
  );
};

export default ParcelLocationSearch;
