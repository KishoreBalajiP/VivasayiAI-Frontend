// S22 (API failure and status recovery): E2E-23 (design-testing note 8).
// GET /progress answers 503 three times. The tracker keeps the last good progress on screen with the
// refresh-error warning, "last updated" does not move and no stage goes backwards; then the API
// recovers and polling (back-off 10, 20, 40 s) clears the warning by itself, and the decision arrives.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { APP_URL } from './lib/env';
import { installTrackerRecorder, readTrackerLogs } from './lib/trackerRecorder';

// Forward order of a stage on screen (a retry may move active <-> waiting; neither goes back to pending).
const STAGE_RANK: Record<string, number> = { pending: 0, active: 1, waiting: 1, complete: 2 };

test('E2E-23: three 503s on /progress show the refresh error without losing progress, then the tracker recovers on its own', async ({ farmerPage: page, harness, farmer }, testInfo) => {
  await installTrackerRecorder(page);
  await harness.scenario({ id: 'S01' });
  await harness.worker('pause');
  const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S01' });

  const tracker = new ClaimTrackerPage(page);
  await tracker.goto(seeded.claimId);
  await tracker.expectOverall('in_progress');
  const lastUpdated = await tracker.lastUpdatedAt();
  const stagesBefore = await tracker.stageStatuses();
  expect(lastUpdated).toBeTruthy();

  let failures = 0;
  await page.route(`**/claims/${seeded.claimId}/progress`, async (route) => {
    if (failures >= 3 || route.request().method() !== 'GET') return route.fallback();
    failures += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': APP_URL, 'Access-Control-Allow-Credentials': 'true' },
      body: JSON.stringify({ success: false, message: 'Service temporarily unavailable' }),
    });
  });

  // The next scheduled read fails: a warning over the last good progress (not a blank page).
  await expect(tracker.refreshError).toBeVisible({ timeout: 40_000 });
  await expect(tracker.root).toHaveAttribute('data-overall-status', 'in_progress');
  expect(await tracker.lastUpdatedAt()).toBe(lastUpdated);
  expect(await tracker.stageStatuses()).toEqual(stagesBefore);
  await screenshot(page, testInfo, 'E2E-23-refresh-error');

  // Three failures in a row (back-off 10 s, 20 s), the warning stays and nothing moves.
  await expect.poll(() => failures, { timeout: 90_000, intervals: [1_000] }).toBe(3);
  await expect(tracker.refreshError).toBeVisible();
  expect(await tracker.lastUpdatedAt()).toBe(lastUpdated);

  // The API is back: the next read (back-off 40 s) succeeds and the warning goes, without a click.
  await expect(tracker.refreshError).toHaveCount(0, { timeout: 75_000 });
  expect(await tracker.lastUpdatedAt()).toBe(lastUpdated); // the worker is still paused: nothing new
  await screenshot(page, testInfo, 'E2E-23-recovered');

  await harness.worker('resume');
  await tracker.expectOverall('decided', 90_000);
  await tracker.expectDecision('verified');

  // No stage ever went backwards on screen.
  const { dom } = await readTrackerLogs(page);
  const seen: Record<string, number> = {};
  for (const state of dom.filter((entry) => !entry.stale)) {
    for (const [id, status] of Object.entries(state.stages)) {
      const rank = STAGE_RANK[status];
      if (rank === undefined) continue;
      expect(rank, `stage ${id} went back to ${status}`).toBeGreaterThanOrEqual(seen[id] ?? -1);
      seen[id] = rank;
    }
  }
});
