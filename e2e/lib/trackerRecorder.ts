// In-page instrumentation for "no fake progress" checks (design-testing note 9). An init script:
//   - wraps window.fetch to log every GET /claims/:id/progress response at the moment it resolves
//     (before the app can render it) together with its parsed `progress` body;
//   - runs a MutationObserver that logs every distinct tracker state the DOM shows
//     (overall status, every stage status, decision, satellite status, last-updated, data-stale).
// Both logs use the page clock, so "the latest API response received before this DOM change" is a
// plain timestamp comparison. Read-only: the wrapper returns the original Response untouched.

import type { Page } from '@playwright/test';

export interface DomTrackerState {
  t: number;
  stale: boolean;
  claimId: string | null;
  overall: string | null;
  decision: string | null;
  stages: Record<string, string>;
  satellite: string | null;
  lastUpdated: string | null;
}

export interface ApiProgressEntry {
  t: number;
  status: number;
  claimId: string | null;
  progress: {
    overallStatus: string;
    decision: string | null;
    lastUpdatedAt: string | null;
    stages: { id: string; status: string }[];
    satellite: { status: string } | null;
  } | null;
}

export const installTrackerRecorder = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    type W = Window & { __e2eDom?: unknown[]; __e2eApi?: unknown[]; __e2eRecorder?: boolean };
    const w = window as W;
    if (w.__e2eRecorder) return;
    w.__e2eRecorder = true;
    w.__e2eDom = [];
    w.__e2eApi = [];

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      try {
        const input = args[0];
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const match = /\/claims\/([^/?#]+)\/progress$/.exec(new URL(raw, window.location.href).pathname);
        if (match) {
          const entry: { t: number; status: number; claimId: string; progress: unknown } = { t: Date.now(), status: response.status, claimId: match[1], progress: null };
          w.__e2eApi!.push(entry);
          response
            .clone()
            .json()
            .then((body: { data?: { progress?: unknown } }) => {
              entry.progress = body?.data?.progress ?? null;
            })
            .catch(() => undefined);
        }
      } catch {
        // never interfere with the app
      }
      return response;
    };

    let lastKey = '';
    const snapshot = () => {
      const root = document.querySelector('[data-testid="claim-tracker"]');
      if (!root) return;
      const stages: Record<string, string> = {};
      root.querySelectorAll('[data-testid="tracker-stage"]').forEach((node) => {
        stages[node.getAttribute('data-stage-id') ?? '?'] = node.getAttribute('data-stage-status') ?? '?';
      });
      const state = {
        stale: root.getAttribute('data-stale') === 'true',
        claimId: root.getAttribute('data-claim-id'),
        overall: root.getAttribute('data-overall-status'),
        decision: root.querySelector('[data-testid="decision-card"]')?.getAttribute('data-decision') ?? null,
        stages,
        satellite: root.querySelector('[data-testid="tracker-satellite"]')?.getAttribute('data-satellite-status') ?? null,
        lastUpdated: root.querySelector('[data-testid="tracker-last-updated"]')?.getAttribute('data-last-updated') || null,
      };
      const key = JSON.stringify(state);
      if (key === lastKey) return;
      lastKey = key;
      w.__e2eDom!.push({ t: Date.now(), ...state });
    };
    const observer = new MutationObserver(snapshot);
    const start = () =>
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-overall-status', 'data-stage-status', 'data-decision', 'data-satellite-status', 'data-stale', 'data-last-updated', 'data-claim-id'],
      });
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
};

export const readTrackerLogs = async (page: Page): Promise<{ dom: DomTrackerState[]; api: ApiProgressEntry[] }> =>
  page.evaluate(() => {
    const w = window as Window & { __e2eDom?: DomTrackerState[]; __e2eApi?: ApiProgressEntry[] };
    return { dom: w.__e2eDom ?? [], api: w.__e2eApi ?? [] };
  });

const apiStages = (entry: ApiProgressEntry): Record<string, string> =>
  Object.fromEntries((entry.progress?.stages ?? []).map((stage) => [stage.id, stage.status]));

/**
 * Every fresh DOM state (not a snapshot, not before the first read) must equal the newest API progress
 * (by lastUpdatedAt, as the app applies them) received before that DOM state appeared. Returns the
 * violations ([] = the DOM never ran ahead of, or diverged from, the API).
 */
export const domStatesNotBackedByApi = (dom: DomTrackerState[], api: ApiProgressEntry[]): string[] => {
  const problems: string[] = [];
  const answered = api.filter((entry) => entry.status === 200 && entry.progress);
  for (const state of dom) {
    if (state.stale || state.overall === null) continue;
    const before = answered.filter((entry) => entry.t <= state.t && (!state.claimId || entry.claimId === state.claimId));
    if (before.length === 0) {
      problems.push(`DOM showed ${state.overall} at ${state.t} before any API progress was received`);
      continue;
    }
    const newest = before.reduce((best, entry) =>
      Date.parse(entry.progress!.lastUpdatedAt ?? '0') >= Date.parse(best.progress!.lastUpdatedAt ?? '0') ? entry : best
    );
    const p = newest.progress!;
    const expectedStages = apiStages(newest);
    const mismatch: string[] = [];
    if (state.overall !== p.overallStatus) mismatch.push(`overall ${state.overall} != ${p.overallStatus}`);
    if ((state.decision ?? null) !== (p.decision ?? null)) mismatch.push(`decision ${state.decision} != ${p.decision}`);
    if (JSON.stringify(state.stages) !== JSON.stringify(expectedStages)) mismatch.push(`stages ${JSON.stringify(state.stages)} != ${JSON.stringify(expectedStages)}`);
    if ((state.satellite ?? null) !== (p.satellite?.status ?? null)) mismatch.push(`satellite ${state.satellite} != ${p.satellite?.status}`);
    if ((state.lastUpdated ?? null) !== (p.lastUpdatedAt ?? null)) mismatch.push(`lastUpdated ${state.lastUpdated} != ${p.lastUpdatedAt}`);
    if (mismatch.length) problems.push(`DOM state at ${state.t}: ${mismatch.join('; ')}`);
  }
  return problems;
};
