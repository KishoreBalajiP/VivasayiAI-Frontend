// S23 (no fake progress, no premature completion): E2E-24 (design-testing note 9).
// Every status the DOM shows must be the status of the newest API progress the page had received
// before showing it: no stage, decision or "last updated" ever runs ahead of the backend. While the
// worker is paused for 30 s, nothing on screen changes at all. Snapshot renders (data-stale, after a
// reload) are not fresh reads and are ignored.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { domStatesNotBackedByApi, installTrackerRecorder, readTrackerLogs } from './lib/trackerRecorder';

test('E2E-24: the DOM never shows a status the API has not reported, and nothing moves while the worker is paused', async ({ farmerPage: page, harness, farmer, network }, testInfo) => {
  await installTrackerRecorder(page);
  // S06: two 429s before the photo check succeeds, so the claim passes through several real states.
  await harness.scenario({ id: 'S06' });
  await harness.worker('pause');
  const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S06' });

  const tracker = new ClaimTrackerPage(page);
  await tracker.goto(seeded.claimId);
  await tracker.expectOverall('in_progress');
  await expect(tracker.decisionCard).toHaveCount(0);

  // 30 s with the worker paused: polls happen, the screen does not change.
  const pausedFrom = (await readTrackerLogs(page)).dom.length;
  const readsBefore = network.matching('GET', /\/progress$/).length;
  await page.waitForTimeout(30_000);
  const paused = (await readTrackerLogs(page)).dom.slice(pausedFrom);
  expect(network.matching('GET', /\/progress$/).length, 'the tracker kept polling while paused').toBeGreaterThan(readsBefore);
  expect(paused, 'DOM tracker states that appeared while the worker was paused').toEqual([]);
  await screenshot(page, testInfo, 'E2E-24-paused');

  await harness.worker('resume');
  await tracker.expectOverall('decided', 120_000);
  await tracker.expectDecision('verified');
  await screenshot(page, testInfo, 'E2E-24-decided');

  const { dom, api } = await readTrackerLogs(page);
  await testInfo.attach('tracker-dom-and-api-log', { body: JSON.stringify({ dom, api }, null, 2), contentType: 'application/json' });
  expect(domStatesNotBackedByApi(dom, api)).toEqual([]);

  // Completion only after the API reported it.
  const firstDecidedDom = dom.find((state) => !state.stale && (state.overall === 'decided' || state.decision));
  const firstDecidedApi = api.find((entry) => entry.progress?.overallStatus === 'decided');
  expect(firstDecidedDom).toBeTruthy();
  expect(firstDecidedApi).toBeTruthy();
  expect(firstDecidedDom!.t).toBeGreaterThanOrEqual(firstDecidedApi!.t);
  expect(dom.filter((state) => !state.stale).length, 'distinct fresh states shown').toBeGreaterThanOrEqual(2);
});
