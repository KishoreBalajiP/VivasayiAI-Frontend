// Claim progress polling — the pure scheduler and the progress snapshot (plan B5, design §6).
//
// No timers, no React, no network here: useClaimProgress (src/hooks) owns the timers and calls
// nextPollDelay after every read. Keeping the arithmetic pure makes every rule testable with a
// seeded `random` and a fixed `now` (POLL-1..8).
//
// Budget (backend read limiter, contract §3): one visible tab polls at most every 10 s, backs off to
// once a minute when nothing changes, and to once every 5 minutes while a person has the claim.

import { parseClaimProgress } from './claimProgress';
import type { ClaimProgress } from '../types';

export const POLL = {
  /** Contract §3: never poll more often than this, whatever else applies. */
  MIN_MS: 10_000,
  ACTIVE_MS: 10_000,
  IDLE_FACTOR: 1.5,
  IDLE_MAX_MS: 60_000,
  /** A person has the claim (held / waiting for review): nothing changes quickly. */
  HELD_MS: 300_000,
  /** The farmer has to act while the checks continue (e.g. submitted without photos). */
  ACTION_REQUIRED_MS: 60_000,
  ERROR_BASE_MS: 10_000,
  ERROR_MAX_MS: 300_000,
  RATE_LIMIT_MIN_MS: 60_000,
  NEXT_CHECK_MAX_MS: 300_000,
  /** Small spread added after a scheduled check so the read lands just after it ran. */
  NEXT_CHECK_SPREAD_MS: 2_000,
  JITTER: 0.2,
} as const;

/** Statuses after which nothing changes without the farmer (or a reviewer) acting first. */
export const isTerminalProgress = (progress: Pick<ClaimProgress, 'overallStatus' | 'claimState'>): boolean =>
  progress.overallStatus === 'decided' ||
  progress.overallStatus === 'withdrawn' ||
  progress.overallStatus === 'draft' ||
  progress.claimState === 'more_evidence_required';

export interface PollError {
  status: number;
  retryAfterMs?: number | null;
}

export interface PollContext {
  /** The latest applied progress (null until one loaded). */
  progress: ClaimProgress | null;
  /** Failed reads in a row (0 after a success). */
  consecutiveErrors: number;
  /** The error of the LAST read, if it failed. */
  lastError?: PollError | null;
  /** Successful reads in a row whose lastUpdatedAt did not move. */
  unchangedPolls: number;
  now: number;
  /** [0, 1); injectable for deterministic tests. */
  random: () => number;
}

// ±JITTER around the base, so many tabs do not poll in lock-step.
const jittered = (base: number, random: () => number): number => base * (1 - POLL.JITTER + 2 * POLL.JITTER * random());

const atLeastMin = (ms: number): number => Math.max(POLL.MIN_MS, Math.round(ms));

const errorBackoff = (consecutiveErrors: number): number =>
  Math.min(POLL.ERROR_MAX_MS, POLL.ERROR_BASE_MS * 2 ** Math.max(0, consecutiveErrors - 1));

/**
 * Milliseconds until the next read, or null to stop polling. Rules, first match wins:
 *   1. 401 / 403 / 404                      → stop (auth layer / not this farmer's claim)
 *   2. 429                                  → max(Retry-After, 60 s, back-off), plus 0–20 %
 *   3. any other failed read                → min(300 s, 10 s × 2^(n−1)) ± 20 %
 *   4. nothing loaded yet                   → 10 s
 *   5. terminal (decided / withdrawn / draft / more evidence required) → stop
 *   6. waiting_for_review                   → 300 s
 *   7. action_required while still submitted → 60 s
 *   8. in progress: 10 s × 1.5^unchanged (≤ 60 s); a later real nextCheckAt is honoured (≤ 300 s)
 * The result is never under 10 s.
 */
export const nextPollDelay = (ctx: PollContext): number | null => {
  const { progress, consecutiveErrors, lastError, unchangedPolls, now, random } = ctx;

  if (lastError && consecutiveErrors > 0) {
    if (lastError.status === 401 || lastError.status === 403 || lastError.status === 404) return null;
    if (lastError.status === 429) {
      const base = Math.max(lastError.retryAfterMs ?? 0, POLL.RATE_LIMIT_MIN_MS, errorBackoff(consecutiveErrors));
      // Only ever later than asked, never earlier.
      return atLeastMin(base * (1 + POLL.JITTER * random()));
    }
    return atLeastMin(jittered(errorBackoff(consecutiveErrors), random));
  }

  if (!progress) return atLeastMin(jittered(POLL.ACTIVE_MS, random));
  if (isTerminalProgress(progress)) return null;
  if (progress.overallStatus === 'waiting_for_review') return atLeastMin(jittered(POLL.HELD_MS, random));
  if (progress.overallStatus === 'action_required') return atLeastMin(jittered(POLL.ACTION_REQUIRED_MS, random));

  const base = Math.min(POLL.IDLE_MAX_MS, POLL.ACTIVE_MS * POLL.IDLE_FACTOR ** Math.max(0, unchangedPolls));
  const nextCheckAt = progress.nextCheckAt ? Date.parse(progress.nextCheckAt) : NaN;
  if (Number.isFinite(nextCheckAt) && nextCheckAt - now > base) {
    // A real scheduled check (never an estimate): read just after it, capped at 5 minutes.
    return atLeastMin(Math.min(nextCheckAt - now + POLL.NEXT_CHECK_SPREAD_MS * random(), POLL.NEXT_CHECK_MAX_MS));
  }
  return atLeastMin(jittered(base, random));
};

// ── Snapshot (resume after a page refresh) ──────────────────────────────────────────────────
// The last progress read is kept in sessionStorage for an hour so a reload shows something at
// once, marked as stale until the first fresh read lands. It holds only the farmer's own
// progress object (no ids beyond the claim's, no tokens) and is cleared on logout (AuthContext).

export const PROGRESS_SNAPSHOT_PREFIX = 'vivasayi.claimProgress.v1:';
export const PROGRESS_SNAPSHOT_TTL_MS = 60 * 60 * 1000;

export const progressSnapshotKey = (claimId: string): string => `${PROGRESS_SNAPSHOT_PREFIX}${claimId}`;

export const defaultSnapshotStorage = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

export const saveProgressSnapshot = (storage: Storage | null, progress: ClaimProgress, now: number): void => {
  if (!storage || progress.legacy) return;
  try {
    storage.setItem(progressSnapshotKey(progress.claimId), JSON.stringify({ savedAt: now, progress }));
  } catch {
    // quota or blocked storage: the snapshot is a convenience only
  }
};

export interface ProgressSnapshot {
  progress: ClaimProgress;
  savedAt: number;
}

/** The stored snapshot for this claim, or null when missing, expired, corrupt or for another claim. */
export const loadProgressSnapshot = (storage: Storage | null, claimId: string, now: number): ProgressSnapshot | null => {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(progressSnapshotKey(claimId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown; progress?: unknown };
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : NaN;
    if (!Number.isFinite(savedAt) || now - savedAt > PROGRESS_SNAPSHOT_TTL_MS || savedAt - now > 60_000) {
      storage.removeItem(progressSnapshotKey(claimId));
      return null;
    }
    const progress = parseClaimProgress(parsed.progress);
    if (!progress || progress.claimId !== claimId) return null;
    return { progress, savedAt };
  } catch {
    return null;
  }
};
