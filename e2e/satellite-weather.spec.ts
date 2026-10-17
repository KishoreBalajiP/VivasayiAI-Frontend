// S13-S16 (satellite and weather): E2E-14, E2E-15, E2E-16, E2E-17.
// Satellite pictures and weather records are SUPPORTING information only (owner decision D1): they
// never block or change the decision, the satellite card is never success- or danger-toned, and the
// supporting-only note is always shown.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { Harness } from './lib/harness';

const SUPPORTING_NOTE = 'Satellite pictures are supporting information only. They never decide your claim and cannot confirm damage on their own.';

const seedAndSettle = async (harness: Harness, accessToken: string, id: string) => {
  await harness.scenario({ id });
  const seeded = await harness.seedClaim({ accessToken, scenario: id });
  const inspection = await harness.waitForInspection(seeded.claimId, (current) => current.settled.decided, { what: `${id} decided` });
  return { claimId: seeded.claimId, inspection };
};

test.describe('Satellite and weather are supporting only', () => {
  test('E2E-14: event today (UTC): the decision is shown while satellite waits for post-event imagery with a next check', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    const { claimId } = await seedAndSettle(harness, farmer.accessToken, 'S13b'); // eventDaysAgo 0
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'pending');
    await expect(tracker.satellite.getByTestId('tracker-satellite-next-check')).toBeVisible();
    await expect(tracker.satellite.locator('li[data-post-open]')).toHaveAttribute('data-post-open', 'false');
    await expect(tracker.satellite).toContainText(SUPPORTING_NOTE);
    await screenshot(page, testInfo, 'E2E-14-satellite-pending-decided');
  });

  test('E2E-14: satellite analysis supports the loss: "passed" in the info tone, supporting only; the decision does not depend on it', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    const { claimId } = await seedAndSettle(harness, farmer.accessToken, 'S13');
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'passed');
    await expect(tracker.satellite.getByTestId('tracker-satellite-status')).toHaveAttribute('data-tone', 'info');
    await expect(tracker.satellite).toContainText('Supporting only');
    await expect(tracker.satellite).toContainText(SUPPORTING_NOTE);
    await screenshot(page, testInfo, 'E2E-14-satellite-passed');
    const progress = await harness.api<{ progress: { satellite: { status: string; supportingOnly: boolean; reasonCode: string } } }>('GET', `/claims/${claimId}/progress`, farmer.accessToken);
    expect(progress.data?.progress.satellite).toMatchObject({ status: 'passed', supportingOnly: true, reasonCode: 'vegetation_drop_consistent_with_damage' });
  });

  test('E2E-15: cloud over every scene: satellite inconclusive (cloud cover), decision unaffected', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    const { claimId } = await seedAndSettle(harness, farmer.accessToken, 'S14');
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'inconclusive');
    await expect(tracker.satellite.getByTestId('tracker-satellite-status')).toHaveAttribute('data-tone', 'quiet');
    await expect(tracker.satellite).toContainText(SUPPORTING_NOTE);
    await screenshot(page, testInfo, 'E2E-15-satellite-cloud');
    const progress = await harness.api<{ progress: { satellite: { reasonCode: string } } }>('GET', `/claims/${claimId}/progress`, farmer.accessToken);
    expect(progress.data?.progress.satellite.reasonCode).toBe('cloud_cover');
  });

  test('E2E-16: no clear vegetation change: satellite inconclusive, never "failed"; AI damage is still verified', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    const { claimId } = await seedAndSettle(harness, farmer.accessToken, 'S15');
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'inconclusive');
    await expect(tracker.satellite.getByTestId('tracker-satellite-status')).not.toHaveAttribute('data-tone', /danger|success/);
    await screenshot(page, testInfo, 'E2E-16-satellite-no-change');
    const progress = await harness.api<{ progress: { satellite: { status: string; reasonCode: string } } }>('GET', `/claims/${claimId}/progress`, farmer.accessToken);
    expect(progress.data?.progress.satellite).toMatchObject({ status: 'inconclusive', reasonCode: 'no_clear_vegetation_change' });
  });

  test('E2E-17: weather unavailable: the weather stage completes as "supporting only" and the decision is unchanged', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    const { claimId } = await seedAndSettle(harness, farmer.accessToken, 'S16');
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await expect(tracker.stage('weather')).toHaveAttribute('data-stage-status', 'complete');
    await expect(tracker.stage('weather')).toContainText('Weather records were not available. Weather is supporting information only, so this does not count against you.');
    await screenshot(page, testInfo, 'E2E-17-weather-unavailable');
  });
});
