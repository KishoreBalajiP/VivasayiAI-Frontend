// S21 (refresh or reopen while processing): E2E-22 (design-testing note 7).
// Nothing depends on the browser staying open: the worker is paused, the farmer submits, reloads and
// opens the deep link in a new tab; when the worker resumes, every open tracker advances by polling
// alone (no click, no reload).

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';
import { utcDateDaysAgo } from './lib/harness';

test('E2E-22: reload and a reopened deep link while the worker is paused resume polling, and the trackers advance on their own when it resumes', async ({ farmerPage: page, context, harness }, testInfo) => {
  await harness.scenario({ id: 'S01' });
  await harness.worker('pause');

  const wizard = new ClaimWizardPage(page);
  await wizard.goto();
  await wizard.expectParcelAutoSelected();
  await wizard.chooseRelationship('I own this land');
  await wizard.next('event');
  await wizard.describeEvent({ type: 'Flood', date: utcDateDaysAgo(3) });
  await wizard.next('evidence');
  await wizard.addPhotos([{ name: 'crop.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-p1`) }]);
  await wizard.next('review');
  await wizard.submit();
  const claimId = await wizard.waitForTracker();

  const tracker = new ClaimTrackerPage(page);
  await tracker.expectOverall('in_progress');
  const trackerUrl = page.url();

  // Reload: the same claim's tracker, from the URL alone.
  const firstRead = page.waitForRequest((request) => request.url().endsWith(`/claims/${claimId}/progress`));
  await page.reload();
  await firstRead;
  expect(page.url()).toBe(trackerUrl);
  await expect(tracker.root).toHaveAttribute('data-claim-id', claimId);
  await tracker.expectOverall('in_progress');
  await screenshot(page, testInfo, 'E2E-22-reloaded-in-progress');

  // Reopen: a new tab on the deep link reads progress at once.
  const reopened = await context.newPage();
  const reopenedRead = reopened.waitForRequest((request) => request.url().endsWith(`/claims/${claimId}/progress`));
  const second = new ClaimTrackerPage(reopened);
  await second.goto(claimId);
  await reopenedRead;
  await second.expectOverall('in_progress');
  expect((await harness.inspect(claimId)).state).toBe('submitted');

  // The worker comes back: both trackers reach the decision by polling (nothing is clicked).
  await harness.worker('resume');
  await harness.waitForInspection(claimId, (inspection) => inspection.settled.decided, { what: 'decided' });
  await second.expectOverall('decided', 90_000);
  await second.expectDecision('verified');
  await tracker.expectOverall('decided', 90_000);
  await tracker.expectDecision('verified');
  await screenshot(page, testInfo, 'E2E-22-decided-without-action');
});
