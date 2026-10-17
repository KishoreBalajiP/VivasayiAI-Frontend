import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useClaimProgress, type ProgressFetcher } from './useClaimProgress';
import { progressFor } from '../test/progressFixtures';
import { createMemoryStorage } from '../test/memoryStorage';
import { progressSnapshotKey, saveProgressSnapshot } from '../utils/progressPolling';
import { ApiClientError } from '../api/client';
import type { ClaimProgress } from '../types';

// POLL-9..17 (design PL-9..17): the polling hook with fake timers. The fetcher is injected, so
// nothing touches the network; every reply is a deferred promise the test resolves explicitly.

const T0 = Date.parse('2026-10-16T09:05:00.000Z');

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const progressAt = (lastUpdatedAt: string, name = 'checks_running', claimId = 'c_1'): ClaimProgress =>
  progressFor(name, { claimId, lastUpdatedAt });

/** A fetcher whose every call returns a fresh deferred; the calls are recorded in order. */
const scriptedFetcher = () => {
  const calls: Array<{ claimId: string; signal: AbortSignal; reply: Deferred<ClaimProgress | null> }> = [];
  const fetcher = vi.fn<ProgressFetcher>((claimId, { signal }) => {
    const reply = deferred<ClaimProgress | null>();
    calls.push({ claimId, signal, reply });
    return reply.promise;
  });
  return { fetcher, calls };
};

let visibility: DocumentVisibilityState = 'visible';
let online = true;

const setVisibility = async (state: DocumentVisibilityState) => {
  visibility = state;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const settle = async (call: { reply: Deferred<ClaimProgress | null> }, value: ClaimProgress | null) => {
  await act(async () => {
    call.reply.resolve(value);
    await Promise.resolve();
  });
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  visibility = 'visible';
  online = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

const mount = (fetcher: ProgressFetcher, storage: Storage | null = createMemoryStorage(), claimId = 'c_1') =>
  renderHook(({ id }) => useClaimProgress(id, { fetchProgress: fetcher, storage, random: () => 0.5 }), {
    initialProps: { id: claimId },
  });

describe('useClaimProgress', () => {
  it('POLL-9: one request at a time — a refresh while a read is running does nothing; polling uses chained timers', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const { result } = mount(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); // mounting reads at once
    expect(result.current.status).toBe('loading');
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      void result.current.refresh();
      void result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));
    expect(result.current.status).toBe('ready');
    expect(result.current.refreshing).toBe(false);
    expect(result.current.progress?.overallStatus).toBe('in_progress');

    await flush(9_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(fetcher).toHaveBeenCalledTimes(2); // the 10 s minimum, then the next read
    await settle(calls[1], progressAt('2026-10-16T09:00:07.000Z'));
    // Nothing changed: the idle back-off (×1.5) applies, still one read at a time.
    await flush(14_999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('POLL-10: replies arriving out of order are dropped (sequence), and so is an older lastUpdatedAt', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const { result } = mount(fetcher);

    // restart() aborts the first read; that reply still arrives later (a fetcher ignoring abort).
    await act(async () => result.current.restart());
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
    await settle(calls[1], progressAt('2026-10-16T09:02:00.000Z', 'land_documents_queued'));
    await settle(calls[0], progressAt('2026-10-16T09:01:00.000Z', 'checks_running'));
    expect(result.current.progress?.lastUpdatedAt).toBe('2026-10-16T09:02:00.000Z');
    expect(result.current.progress?.stages[1].status).toBe('complete');

    // A newer request whose reply is older than what is shown (a lagging replica): dropped.
    await flush(10_000);
    expect(calls).toHaveLength(3);
    await settle(calls[2], progressAt('2026-10-16T09:00:30.000Z', 'checks_running'));
    expect(result.current.progress?.lastUpdatedAt).toBe('2026-10-16T09:02:00.000Z');
    expect(result.current.progress?.stages[1].status).toBe('complete');
  });

  it('POLL-11: a hidden tab pauses polling; becoming visible reads at once when a read was due', async () => {
    const { fetcher, calls } = scriptedFetcher();
    mount(fetcher);
    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));

    await setVisibility('hidden');
    await flush(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await setVisibility('visible');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('POLL-11: visible again before the read is due and within 10 s of the last read: waits out the remaining time', async () => {
    const { fetcher, calls } = scriptedFetcher();
    mount(fetcher);
    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));
    await flush(10_000);
    await settle(calls[1], progressAt('2026-10-16T09:00:07.000Z')); // unchanged → next in 15 s
    await setVisibility('hidden');
    await flush(4_000);
    await setVisibility('visible');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await flush(10_999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('POLL-12: offline pauses and flags it; back online reads at once', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const { result } = mount(fetcher);
    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));

    online = false;
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.offline).toBe(true);
    await flush(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.offline).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('POLL-13: window focus reads at once when the last read is over 10 s old, not otherwise', async () => {
    const { fetcher, calls } = scriptedFetcher();
    mount(fetcher);
    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // just read

    await flush(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await settle(calls[1], progressAt('2026-10-16T09:00:07.000Z')); // next due in 15 s
    await flush(11_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('POLL-14: unmounting aborts the read and clears the timers; errors back off and 404 stops', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const { result, unmount } = mount(fetcher);
    await act(async () => {
      calls[0].reply.reject(new ApiClientError(503, 'serviceBusy'));
    });
    await flush();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({ status: 503, retryAfterMs: null });
    await flush(10_000); // first error: 10 s
    expect(calls).toHaveLength(2);
    await act(async () => {
      calls[1].reply.reject(new ApiClientError(503, 'serviceBusy'));
    });
    await flush(19_999); // second error: 20 s
    expect(calls).toHaveLength(2);
    await flush(1);
    expect(calls).toHaveLength(3);

    unmount();
    expect(calls[2].signal.aborted).toBe(true);
    await flush(600_000);
    expect(calls).toHaveLength(3);

    const second = scriptedFetcher();
    const view = mount(second.fetcher);
    await act(async () => {
      second.calls[0].reply.reject(new ApiClientError(404, 'notFound'));
    });
    await flush();
    expect(view.result.current.status).toBe('notFound');
    await flush(600_000);
    expect(second.calls).toHaveLength(1);
    view.unmount();
  });

  it('POLL-15: a new claim id aborts the old read, resets the state and reads the new claim', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const { result, rerender } = mount(fetcher);
    await settle(calls[0], progressAt('2026-10-16T09:00:07.000Z'));
    await flush(10_000);
    expect(calls).toHaveLength(2);

    rerender({ id: 'c_2' });
    expect(calls[1].signal.aborted).toBe(true);
    expect(calls[2].claimId).toBe('c_2');
    expect(result.current.progress).toBeNull();
    expect(result.current.status).toBe('loading');

    await settle(calls[1], progressAt('2026-10-16T09:09:00.000Z')); // the old claim's late reply
    expect(result.current.progress).toBeNull();
    await settle(calls[2], progressAt('2026-10-16T09:00:01.000Z', 'submitted_fresh', 'c_2'));
    expect(result.current.progress?.claimId).toBe('c_2');
  });

  it('POLL-16: a stored snapshot shows at once, marked stale, until the first fresh read; an expired one is ignored', async () => {
    const storage = createMemoryStorage();
    saveProgressSnapshot(storage, progressAt('2026-10-16T09:00:07.000Z', 'held_technical_retrying'), T0 - 10 * 60_000);
    const { fetcher, calls } = scriptedFetcher();
    const { result, unmount } = mount(fetcher, storage);
    expect(result.current.progress?.overallStatus).toBe('in_progress');
    expect(result.current.stale).toBe(true);
    expect(result.current.status).toBe('ready');
    expect(result.current.fetchedAt).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await settle(calls[0], progressAt('2026-10-16T09:04:00.000Z', 'deciding'));
    expect(result.current.stale).toBe(false);
    expect(result.current.fetchedAt).toBe(T0);
    expect(JSON.parse(storage.getItem(progressSnapshotKey('c_1'))!).progress.lastUpdatedAt).toBe('2026-10-16T09:04:00.000Z');
    unmount();

    const old = createMemoryStorage();
    saveProgressSnapshot(old, progressAt('2026-10-16T07:00:00.000Z'), T0 - 61 * 60_000);
    const second = scriptedFetcher();
    const view = mount(second.fetcher, old);
    expect(view.result.current.progress).toBeNull();
    expect(view.result.current.stale).toBe(false);
    view.unmount();
  });

  it('POLL-17: a terminal claim stops polling; with satellite still pending it is read once on focus after 10 minutes', async () => {
    const { fetcher, calls } = scriptedFetcher();
    const decided = progressFor('decided_verified', { claimId: 'c_1' });
    const satellitePending = { ...decided, satellite: { ...decided.satellite!, status: 'pending' as const, reasonCode: 'waiting_for_post_event_imagery' } };
    mount(fetcher);
    await settle(calls[0], satellitePending);
    await flush(30 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1); // stopped: no timer

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await settle(calls[1], satellitePending);
    await flush(5 * 60_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher).toHaveBeenCalledTimes(2); // under 10 minutes since the last read

    // A decided claim whose satellite is settled is never read again on focus.
    const settled = scriptedFetcher();
    const view = mount(settled.fetcher);
    await settle(settled.calls[0], decided);
    await flush(60 * 60_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(settled.fetcher).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
