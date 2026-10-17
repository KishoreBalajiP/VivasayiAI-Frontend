import { describe, expect, it } from 'vitest';
import {
  POLL,
  PROGRESS_SNAPSHOT_TTL_MS,
  isTerminalProgress,
  loadProgressSnapshot,
  nextPollDelay,
  progressSnapshotKey,
  saveProgressSnapshot,
  type PollContext,
} from './progressPolling';
import { progressFor } from '../test/progressFixtures';
import { createMemoryStorage } from '../test/memoryStorage';
import type { ClaimProgress } from '../types';

// POLL-1..8 (design PL-1..8): the pure scheduler. `random` is seeded so every bound is exact.

const NOW = Date.parse('2026-10-16T09:05:00.000Z');
const LOW = () => 0; // the lower jitter bound
const HIGH = () => 0.999_999; // the upper jitter bound
const MID = () => 0.5; // no jitter

const running = (overrides: Partial<ClaimProgress> = {}): ClaimProgress => ({
  ...progressFor('checks_running', { claimId: 'c_1' }),
  ...overrides,
});

const ctx = (overrides: Partial<PollContext> = {}): PollContext => ({
  progress: running(),
  consecutiveErrors: 0,
  lastError: null,
  unchangedPolls: 0,
  now: NOW,
  random: MID,
  ...overrides,
});

describe('nextPollDelay', () => {
  it('POLL-1: never below the 10 s minimum; jitter stays within ±20 % and never goes under the floor', () => {
    expect(nextPollDelay(ctx())).toBe(10_000);
    expect(nextPollDelay(ctx({ random: LOW }))).toBe(10_000); // 8 s jittered → floored at 10 s
    expect(nextPollDelay(ctx({ random: HIGH }))).toBeLessThanOrEqual(12_000);
    for (let i = 0; i < 50; i += 1) {
      const delay = nextPollDelay(ctx({ random: Math.random, unchangedPolls: 3 }))!;
      const base = POLL.ACTIVE_MS * POLL.IDLE_FACTOR ** 3; // 33.75 s
      expect(delay).toBeGreaterThanOrEqual(Math.max(POLL.MIN_MS, base * 0.8 - 1));
      expect(delay).toBeLessThanOrEqual(base * 1.2 + 1);
    }
    // No progress yet (first read failed to apply): 10 s.
    expect(nextPollDelay(ctx({ progress: null }))).toBe(10_000);
  });

  it('POLL-2: idle back-off ×1.5 per unchanged read, capped at 60 s; a change resets it', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 10].map((unchangedPolls) => nextPollDelay(ctx({ unchangedPolls })));
    expect(delays).toEqual([10_000, 15_000, 22_500, 33_750, 50_625, 60_000, 60_000, 60_000]);
    expect(nextPollDelay(ctx({ unchangedPolls: 0 }))).toBe(10_000);
  });

  it('POLL-3: a real nextCheckAt later than the base is honoured (+0–2 s), capped at 300 s; a past one uses the base', () => {
    const inFiveMinutes = new Date(NOW + 4 * 60_000).toISOString();
    expect(nextPollDelay(ctx({ progress: running({ nextCheckAt: inFiveMinutes }), random: LOW }))).toBe(240_000);
    expect(nextPollDelay(ctx({ progress: running({ nextCheckAt: inFiveMinutes }), random: HIGH }))).toBeLessThanOrEqual(242_000);
    const inAnHour = new Date(NOW + 60 * 60_000).toISOString();
    expect(nextPollDelay(ctx({ progress: running({ nextCheckAt: inAnHour }) }))).toBe(300_000);
    const past = new Date(NOW - 60_000).toISOString();
    expect(nextPollDelay(ctx({ progress: running({ nextCheckAt: past }) }))).toBe(10_000);
    // Sooner than the idle base: the base wins (never more often than the back-off allows).
    const inTwentySeconds = new Date(NOW + 20_000).toISOString();
    expect(nextPollDelay(ctx({ progress: running({ nextCheckAt: inTwentySeconds }), unchangedPolls: 5 }))).toBe(60_000);
  });

  it('POLL-4: held for a person (waiting_for_review) polls every 5 minutes', () => {
    const held = progressFor('held_ai_no_damage', { claimId: 'c_1' });
    expect(nextPollDelay(ctx({ progress: held }))).toBe(300_000);
    expect(nextPollDelay(ctx({ progress: held, random: LOW }))).toBe(240_000);
  });

  it('POLL-5: action_required while the claim is still submitted polls every minute', () => {
    const noPhotos = progressFor('submitted_without_photos', { claimId: 'c_1' });
    expect(noPhotos.claimState).toBe('submitted');
    expect(nextPollDelay(ctx({ progress: noPhotos }))).toBe(60_000);
  });

  it('POLL-6: terminal states stop polling: decided, withdrawn, draft, more evidence required', () => {
    for (const name of ['decided_verified', 'decided_by_reviewer', 'withdrawn_after_submit', 'withdrawn_draft', 'draft_no_photos', 'more_evidence_required']) {
      const progress = progressFor(name, { claimId: 'c_1' });
      expect(isTerminalProgress(progress), name).toBe(true);
      expect(nextPollDelay(ctx({ progress })), name).toBeNull();
    }
    expect(isTerminalProgress(running())).toBe(false);
  });

  it('POLL-7: a failed read backs off 10, 20, 40 … s up to 300 s, ±20 %', () => {
    const sequence = [1, 2, 3, 4, 5, 6, 9].map((n) => nextPollDelay(ctx({ consecutiveErrors: n, lastError: { status: 503 } })));
    expect(sequence).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(nextPollDelay(ctx({ consecutiveErrors: 3, lastError: { status: 0 }, random: HIGH }))).toBeLessThanOrEqual(48_000);
    expect(nextPollDelay(ctx({ consecutiveErrors: 3, lastError: { status: 500 }, random: LOW }))).toBe(32_000);
    // An error wins over a terminal snapshot: the next read is still planned.
    expect(nextPollDelay(ctx({ progress: progressFor('decided_verified'), consecutiveErrors: 1, lastError: { status: 503 } }))).toBe(10_000);
  });

  it('POLL-8: 429 waits at least 60 s or the server\'s Retry-After (never earlier); 401, 403 and 404 stop', () => {
    expect(nextPollDelay(ctx({ consecutiveErrors: 1, lastError: { status: 429 }, random: LOW }))).toBe(60_000);
    expect(nextPollDelay(ctx({ consecutiveErrors: 1, lastError: { status: 429, retryAfterMs: 120_000 }, random: LOW }))).toBe(120_000);
    expect(nextPollDelay(ctx({ consecutiveErrors: 1, lastError: { status: 429, retryAfterMs: 5_000 }, random: HIGH }))).toBeLessThanOrEqual(72_000);
    expect(nextPollDelay(ctx({ consecutiveErrors: 6, lastError: { status: 429, retryAfterMs: 1_000 }, random: LOW }))).toBe(300_000);
    for (const status of [401, 403, 404]) {
      expect(nextPollDelay(ctx({ consecutiveErrors: 1, lastError: { status } })), String(status)).toBeNull();
    }
  });
});

describe('progress snapshot', () => {
  it('POLL-16 (pure): saved per claim, read back within an hour, ignored when expired, corrupt or for another claim', () => {
    const storage = createMemoryStorage();
    const progress = running();
    saveProgressSnapshot(storage, progress, NOW);
    expect(storage.getItem(progressSnapshotKey('c_1'))).not.toBeNull();
    expect(loadProgressSnapshot(storage, 'c_1', NOW + 5 * 60_000)).toEqual({ progress, savedAt: NOW });
    expect(loadProgressSnapshot(storage, 'c_2', NOW)).toBeNull();
    expect(loadProgressSnapshot(storage, 'c_1', NOW + PROGRESS_SNAPSHOT_TTL_MS + 1)).toBeNull();
    expect(storage.getItem(progressSnapshotKey('c_1'))).toBeNull(); // the expired entry is removed

    storage.setItem(progressSnapshotKey('c_1'), '{not json');
    expect(loadProgressSnapshot(storage, 'c_1', NOW)).toBeNull();
    storage.setItem(progressSnapshotKey('c_1'), JSON.stringify({ savedAt: NOW, progress: { contractVersion: 'progress-v9' } }));
    expect(loadProgressSnapshot(storage, 'c_1', NOW)).toBeNull();
    // A legacy (client-built) view is never stored as if the backend had said it.
    saveProgressSnapshot(storage, { ...progress, claimId: 'c_3', legacy: true }, NOW);
    expect(storage.getItem(progressSnapshotKey('c_3'))).toBeNull();
    expect(loadProgressSnapshot(null, 'c_1', NOW)).toBeNull();
  });
});
