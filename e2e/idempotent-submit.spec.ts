// S03 (duplicate submit, idempotent retries): E2E-03 (design-testing note 1).
// A double click on Submit, then the first /submit's RESPONSE is lost (the server processed it; the
// browser sees a connection reset). The wizard retries once by itself and must get a 200: one claim,
// one `submitted` audit and one job per verification step. The worker keeps running, as in
// production, so the claim may already be decided when the retry arrives.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';
import { utcDateDaysAgo } from './lib/harness';

const SUBMIT_PATH = /^\/claims\/[^/]+\/submit$/;

test('E2E-03: double-click submit and a connection reset on /submit still give one claim, one submitted audit and one job per step', async ({ farmerPage: page, harness, network }, testInfo) => {
  await harness.scenario({ id: 'S01' });

  const submitStatuses: number[] = [];
  let submits = 0;
  await page.route(
    (url) => SUBMIT_PATH.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      submits += 1;
      if (submits === 1) {
        // The server receives and processes the submit; its answer never reaches the browser.
        const answer = await route.fetch();
        submitStatuses.push(answer.status());
        await route.abort('connectionreset');
        return;
      }
      await route.continue();
    }
  );
  const retried = page.waitForResponse((response) => SUBMIT_PATH.test(new URL(response.url()).pathname) && response.request().method() === 'POST');

  const wizard = new ClaimWizardPage(page);
  await wizard.goto();
  await wizard.expectParcelAutoSelected();
  await wizard.chooseRelationship('I own this land');
  await wizard.next('event');
  await wizard.describeEvent({ type: 'Flood', date: utcDateDaysAgo(4) });
  await wizard.next('evidence');
  await wizard.addPhotos([{ name: 'crop.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-p1`) }]);
  await expect(wizard.photos()).toHaveCount(1);
  await wizard.next('review');
  await expect(wizard.submitButton).toBeEnabled();
  await wizard.submitButton.dblclick();

  const retry = await retried;
  expect(submitStatuses, 'the lost first submit was processed by the server').toEqual([200]);
  expect(retry.status(), 'the automatic retry of /submit').toBe(200);
  const retryBody = (await retry.json()) as { message: string; data: { claim: { id: string; state: string } } };
  expect(retryBody.message).toBe('Claim already submitted');

  const claimId = await wizard.waitForTracker();
  expect(retryBody.data.claim.id).toBe(claimId);
  await expect(wizard.submitError).toHaveCount(0);

  // One create for the double click; two submits (the lost one and the retry).
  expect(network.matching('POST', /^\/claims$/)).toHaveLength(1);
  expect(network.matching('POST', SUBMIT_PATH)).toHaveLength(2);

  const tracker = new ClaimTrackerPage(page);
  await tracker.expectOverall('decided', 90_000);
  await tracker.expectDecision('verified');
  await screenshot(page, testInfo, 'E2E-03-decided');

  const inspection = await harness.inspect(claimId);
  expect(inspection.audits.submitted, 'submitted audit rows').toBe(1);
  expect(inspection.audits.verified).toBe(1);
  expect(inspection.submissionRound).toBe(1);
  const jobsPerStep = inspection.jobs.reduce<Record<string, number>>((counts, job) => ({ ...counts, [job.step]: (counts[job.step] ?? 0) + 1 }), {});
  expect(Object.values(jobsPerStep).every((count) => count === 1), `one job per step: ${JSON.stringify(jobsPerStep)}`).toBe(true);
  expect(Object.keys(jobsPerStep)).toEqual(expect.arrayContaining(['ai_assessment', 'weather', 'engine']));
});
