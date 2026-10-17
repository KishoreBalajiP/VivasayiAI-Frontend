import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/client';
import { getClaimProgress } from '../api/claims';
import {
  defaultSnapshotStorage,
  isTerminalProgress,
  loadProgressSnapshot,
  nextPollDelay,
  saveProgressSnapshot,
  type PollError,
} from '../utils/progressPolling';
import type { ClaimProgress } from '../types';

// Polls the farmer progress contract for one claim (plan B5, design §6.2). The arithmetic lives
// in utils/progressPolling.ts; this hook owns the timers and the browser signals.
//
//   - one request at a time (a refresh while one is running does nothing) with an AbortController;
//   - every request gets a sequence number, and a response is applied only if it is the newest
//     request AND its lastUpdatedAt is not older than what is shown (stale replies are dropped);
//   - chained setTimeout, never setInterval; the delay is re-planned after every read;
//   - hidden tab: the timer is cleared. Visible again (or window focus): read at once if a read
//     was due or the last one is over 10 s old, else wait out the remaining time;
//   - offline: paused and flagged; online: read at once;
//   - stops on a terminal state (decided, withdrawn, draft, more evidence required) and on
//     401/403/404. A terminal claim whose satellite check is still pending is read once on
//     focus when the last read is over 10 minutes old (supporting info only; no timer);
//   - the last read is kept in sessionStorage (1 h) and shown at once after a reload, marked stale.

export type ClaimProgressStatus = 'loading' | 'ready' | 'error' | 'notFound' | 'unsupported';

export type ProgressFetcher = (claimId: string, options: { signal: AbortSignal }) => Promise<ClaimProgress | null>;

export interface ProgressReadError {
  status: number;
  retryAfterMs: number | null;
}

export interface UseClaimProgressOptions {
  /** Defaults to GET /claims/:id/progress. The tracker passes one with the legacy fallback. */
  fetchProgress?: ProgressFetcher;
  /** Snapshot storage; defaults to sessionStorage. null disables the snapshot. */
  storage?: Storage | null;
  now?: () => number;
  random?: () => number;
}

export interface UseClaimProgressResult {
  progress: ClaimProgress | null;
  status: ClaimProgressStatus;
  /** The last read's failure (null after a successful read). The last good progress stays shown. */
  error: ProgressReadError | null;
  offline: boolean;
  /** When the shown progress was last confirmed by the server (client clock), null for a snapshot. */
  fetchedAt: number | null;
  /** The shown progress is a stored snapshot not yet confirmed by a fresh read. */
  stale: boolean;
  refreshing: boolean;
  /** Read now (no-op while a read is running), then re-plan polling. */
  refresh: () => Promise<void>;
  /** Abort any read, reset back-off and read now. */
  restart: () => void;
}

export const VISIBLE_REFETCH_MS = 10_000;
export const TERMINAL_SATELLITE_REFETCH_MS = 10 * 60_000;

const defaultFetcher: ProgressFetcher = (claimId, { signal }) => getClaimProgress(claimId, { signal });

const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';
const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

const isOlder = (candidate: string | null, current: string | null): boolean => {
  if (!candidate || !current) return false;
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
};

export const useClaimProgress = (claimId: string, options: UseClaimProgressOptions = {}): UseClaimProgressResult => {
  const fetcherRef = useRef<ProgressFetcher>(options.fetchProgress ?? defaultFetcher);
  fetcherRef.current = options.fetchProgress ?? defaultFetcher;
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const randomRef = useRef(options.random ?? Math.random);
  randomRef.current = options.random ?? Math.random;
  const storageRef = useRef<Storage | null>(options.storage === undefined ? defaultSnapshotStorage() : options.storage);
  storageRef.current = options.storage === undefined ? defaultSnapshotStorage() : options.storage;

  const [initialSnapshot] = useState(() => loadProgressSnapshot(storageRef.current, claimId, nowRef.current()));
  const [progress, setProgress] = useState<ClaimProgress | null>(initialSnapshot?.progress ?? null);
  const [status, setStatus] = useState<ClaimProgressStatus>(initialSnapshot ? 'ready' : 'loading');
  const [error, setError] = useState<ProgressReadError | null>(null);
  const [offline, setOffline] = useState<boolean>(isOffline);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [stale, setStale] = useState<boolean>(Boolean(initialSnapshot));
  const [refreshing, setRefreshing] = useState(false);

  // Bound to the current claim's polling session by the effect below.
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    const session = { cancelled: false };
    const now = () => nowRef.current();
    const storage = storageRef.current;
    const st = {
      seq: 0,
      inFlight: false,
      controller: null as AbortController | null,
      timer: null as ReturnType<typeof setTimeout> | null,
      /** When the next read is due; null once polling stopped. */
      dueAt: null as number | null,
      stopped: false,
      lastFetchAt: null as number | null,
      consecutiveErrors: 0,
      unchangedPolls: 0,
      lastError: null as PollError | null,
      progress: null as ClaimProgress | null,
    };

    // A new claim (or a remount) starts from its own snapshot, never from another claim's state.
    const snapshot = loadProgressSnapshot(storage, claimId, now());
    st.progress = snapshot?.progress ?? null;
    setProgress(st.progress);
    setStale(Boolean(snapshot));
    setStatus(snapshot ? 'ready' : 'loading');
    setError(null);
    setFetchedAt(null);
    setRefreshing(false);
    setOffline(isOffline());

    const clearTimer = () => {
      if (st.timer !== null) {
        clearTimeout(st.timer);
        st.timer = null;
      }
    };

    const startTimer = (delay: number) => {
      clearTimer();
      st.timer = setTimeout(() => {
        st.timer = null;
        void fetchNow();
      }, Math.max(0, delay));
    };

    const plan = () => {
      const delay = nextPollDelay({
        progress: st.progress,
        consecutiveErrors: st.consecutiveErrors,
        lastError: st.lastError,
        unchangedPolls: st.unchangedPolls,
        now: now(),
        random: randomRef.current,
      });
      clearTimer();
      if (delay === null) {
        st.stopped = true;
        st.dueAt = null;
        return;
      }
      st.stopped = false;
      st.dueAt = now() + delay;
      // Hidden or offline: remember when it was due; visibility/online resumes it.
      if (!isHidden() && !isOffline()) startTimer(delay);
    };

    const fetchNow = async (): Promise<void> => {
      if (session.cancelled || st.inFlight) return;
      clearTimer();
      const seq = ++st.seq;
      const controller = new AbortController();
      st.controller = controller;
      st.inFlight = true;
      setRefreshing(true);
      try {
        const next = await fetcherRef.current(claimId, { signal: controller.signal });
        if (session.cancelled || seq !== st.seq || controller.signal.aborted) return;
        st.lastFetchAt = now();
        st.consecutiveErrors = 0;
        st.lastError = null;
        setError(null);
        if (next === null || next.claimId !== claimId) {
          // Not a progress-v1 object this client understands: never guess, never keep polling.
          st.stopped = true;
          st.dueAt = null;
          setStatus('unsupported');
          return;
        }
        const current = st.progress;
        if (current && isOlder(next.lastUpdatedAt, current.lastUpdatedAt)) {
          // An older reply than what is shown (out-of-order or a lagging replica): drop it.
          st.unchangedPolls += 1;
          plan();
          return;
        }
        st.unchangedPolls = current && current.lastUpdatedAt === next.lastUpdatedAt ? st.unchangedPolls + 1 : 0;
        st.progress = next;
        setProgress(next);
        setStatus('ready');
        setStale(false);
        setFetchedAt(st.lastFetchAt);
        saveProgressSnapshot(storage, next, st.lastFetchAt);
        plan();
      } catch (err) {
        if (session.cancelled || seq !== st.seq || controller.signal.aborted) return;
        st.lastFetchAt = now();
        const failure: ProgressReadError = {
          status: err instanceof ApiClientError ? err.status : 0,
          retryAfterMs: err instanceof ApiClientError ? err.retryAfterMs ?? null : null,
        };
        st.consecutiveErrors += 1;
        st.lastError = failure;
        setError(failure);
        if (failure.status === 404) setStatus('notFound');
        // With progress already on screen it stays there (status 'ready' + the error banner).
        else if (!st.progress) setStatus('error');
        plan();
      } finally {
        if (seq === st.seq) {
          st.inFlight = false;
          st.controller = null;
          if (!session.cancelled) setRefreshing(false);
        }
      }
    };

    const resume = () => {
      if (session.cancelled || st.inFlight || isHidden() || isOffline()) return;
      const t = now();
      if (st.stopped) {
        const satellite = st.progress?.satellite?.status;
        const satelliteMayChange = satellite === 'pending' || satellite === 'processing';
        if (
          st.progress &&
          isTerminalProgress(st.progress) &&
          satelliteMayChange &&
          st.lastFetchAt !== null &&
          t - st.lastFetchAt > TERMINAL_SATELLITE_REFETCH_MS
        ) {
          void fetchNow();
        }
        return;
      }
      const due = st.dueAt !== null && t >= st.dueAt;
      const lastIsOld = st.lastFetchAt === null || t - st.lastFetchAt > VISIBLE_REFETCH_MS;
      if (due || lastIsOld) void fetchNow();
      else if (st.dueAt !== null) startTimer(st.dueAt - t);
    };

    const onVisibility = () => {
      if (isHidden()) clearTimer();
      else resume();
    };
    const onFocus = () => resume();
    const onOffline = () => {
      setOffline(true);
      clearTimer();
    };
    const onOnline = () => {
      setOffline(false);
      if (!st.stopped) void fetchNow();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    refreshRef.current = async () => {
      if (st.inFlight) return;
      await fetchNow();
    };
    restartRef.current = () => {
      if (session.cancelled) return;
      st.controller?.abort();
      st.seq += 1; // any reply still on its way is now stale
      st.inFlight = false;
      st.controller = null;
      st.consecutiveErrors = 0;
      st.unchangedPolls = 0;
      st.lastError = null;
      st.stopped = false;
      void fetchNow();
    };

    // Mounting (or a new claim) always reads at once, visible or not.
    void fetchNow();

    return () => {
      session.cancelled = true;
      st.seq += 1;
      st.controller?.abort();
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [claimId]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const restart = useCallback(() => restartRef.current(), []);

  return { progress, status, error, offline, fetchedAt, stale, refreshing, refresh, restart };
};

export default useClaimProgress;
