// S06-S08 (provider failures): E2E-06, E2E-07, E2E-08a, E2E-08b.
// A provider failure is never the farmer's fault: it is retried, and when it does not recover the
// claim is held for a person (technical wait). It never becomes "rejected" or "more evidence".

import type { Page } from '@playwright/test';
import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { Harness, type ScenarioDefinition } from './lib/harness';
import { installTrackerRecorder, readTrackerLogs } from './lib/trackerRecorder';

const ADVERSE = ['rejected', 'more_evidence_required'];
const ADVERSE_TEXT = /More evidence (is )?(needed|required)|Rejected/i;

/** Every DOM state and every /progress answer seen in this page: never adverse, never "action required". */
const expectNeverAdverse = async (page: Page) => {
  const { dom, api } = await readTrackerLogs(page);
  expect(dom.length, 'tracker states recorded').toBeGreaterThan(0);
  for (const state of dom) {
    expect(ADVERSE, `DOM decision at ${state.t}`).not.toContain(state.decision);
    expect(state.overall, `DOM overall status at ${state.t}`).not.toBe('action_required');
  }
  for (const entry of api.filter((item) => item.progress)) {
    expect(ADVERSE).not.toContain(entry.progress!.decision);
    expect(entry.progress!.overallStatus).not.toBe('action_required');
  }
};

const scenarioById = async (harness: Harness, id: string): Promise<ScenarioDefinition> => {
  const scenario = (await harness.scenarios()).scenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`scenario ${id} missing from scenarios.json`);
  return scenario;
};

test.describe('Provider failures are technical, never adverse', () => {
  test('E2E-06: Gemini 429 twice: the photo check waits with a next check time, then the decision arrives', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    await installTrackerRecorder(page);
    await harness.scenario({ id: 'S06' }); // failN:q429:2
    await harness.worker('pause');
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S06' });
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('in_progress');
    await harness.worker('resume');

    // The backend reports "waiting" with a nextCheckAt only while the retry is really in the future
    // (1-2 s in this harness). The page is read at that moment ("Check for updates", the farmer's own
    // control), so the retry wait is seen as the farmer would see it; the decision afterwards comes by
    // polling alone.
    let seenWaiting = false;
    for (const until = Date.now() + 60_000; !seenWaiting && Date.now() < until; ) {
      const job = (await harness.inspect(seeded.claimId)).jobs.find((entry) => entry.step === 'ai_assessment');
      if (job?.status === 'succeeded') break;
      if (job?.status === 'queued' && job.lastErrorKind && job.runAt && Date.parse(job.runAt) - Date.now() > 600) {
        await tracker.checkForUpdates();
        try {
          await expect(tracker.stage('photos')).toHaveAttribute('data-stage-status', 'waiting', { timeout: 1_000 });
          await expect(tracker.stage('photos').getByTestId('tracker-stage-next-check')).toBeVisible({ timeout: 500 });
          seenWaiting = true;
          await screenshot(page, testInfo, 'E2E-06-photos-waiting');
        } catch {
          // the retry ran before the read landed; the next failure gives another window
        }
      }
      if (!seenWaiting) await page.waitForTimeout(50);
    }
    expect(seenWaiting, 'the photos stage was shown waiting, with its next check time').toBe(true);
    await expect(tracker.decisionCard).toHaveCount(0);

    // The provider recovers on the third call; polling alone brings the decision.
    await tracker.expectOverall('decided', 120_000);
    await tracker.expectDecision('verified');
    await expect(tracker.stage('photos')).toHaveAttribute('data-stage-status', 'complete');
    await expect(tracker.root).not.toContainText(ADVERSE_TEXT);
    await screenshot(page, testInfo, 'E2E-06-decided');
    await expectNeverAdverse(page);
    const { dom, api } = await readTrackerLogs(page);
    expect(dom.some((state) => state.stages.photos === 'waiting')).toBe(true);
    expect(api.some((entry) => entry.progress?.stages.some((stage) => stage.id === 'photos' && stage.status === 'waiting'))).toBe(true);

    const inspection = await harness.inspect(seeded.claimId);
    expect(inspection.state).toBe('verified');
    expect(inspection.jobs.find((job) => job.step === 'ai_assessment')?.attempts).toBe(3);
  });

  for (const { id, title } of [
    { id: 'S07', title: 'E2E-07: Gemini 503 on every call: technical hold, the claim stays listed after a reload, never adverse' },
    { id: 'S08a', title: 'E2E-08a: Gemini times out on every photo: technical hold, never adverse' },
  ]) {
    test(title, async ({ farmerPage: page, harness, farmer }, testInfo) => {
      await installTrackerRecorder(page);
      const scenario = await scenarioById(harness, id);
      await harness.scenario({ id });
      const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: id });

      const tracker = new ClaimTrackerPage(page);
      await tracker.goto(seeded.claimId);
      await tracker.expectOverall(/in_progress|waiting_for_review/);

      // Two automatic recovery rounds, then a person (critique E4: the overall status flips while the
      // dead photo check is re-queued, so the final state is awaited through the control server).
      const settled = await harness.waitForInspection(seeded.claimId, (inspection) => Harness.settled(scenario, inspection), {
        what: `${id} settled (held after ${scenario.expected.recoveryRound} recovery rounds)`,
        timeoutMs: 150_000,
      });
      expect(settled.state).toBe('submitted');
      expect(settled.assessment?.held).toBe(true);
      expect(settled.settled.maxRecoveryRound).toBe(scenario.expected.recoveryRound);

      // Reload: the claim is still there and the tracker shows the technical wait.
      await page.reload();
      await tracker.expectOverall('waiting_for_review');
      await expect(tracker.stage('photos')).toHaveAttribute('data-stage-status', 'failed_technical');
      await expect(tracker.decisionCard).toHaveCount(0);
      await expect(tracker.root).not.toContainText(ADVERSE_TEXT);
      await screenshot(page, testInfo, `${title.slice(0, 8)}-technical-hold`);
      await expectNeverAdverse(page);

      await page.goto('/#/claims');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'My Claims' })).toBeVisible();
      const claims = page.getByRole('main').getByRole('listitem');
      await expect(claims).toHaveCount(1);
      await expect(claims.first()).not.toContainText(ADVERSE_TEXT);
    });
  }

  test('E2E-08b: malformed model output: held as a technical issue, never "more evidence"', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    await installTrackerRecorder(page);
    const scenario = await scenarioById(harness, 'S08b');
    await harness.scenario({ id: 'S08b' });
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S08b' });

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await harness.waitForInspection(seeded.claimId, (inspection) => Harness.settled(scenario, inspection), { what: 'S08b held', timeoutMs: 120_000 });
    // Held claims are re-read every 5 minutes; the farmer's "Check for updates" reads now.
    await tracker.checkForUpdates();
    await tracker.expectOverall('waiting_for_review');
    await expect(tracker.stage('photos')).toHaveAttribute('data-stage-status', 'failed_technical');
    await expect(tracker.decisionCard).toHaveCount(0);
    expect(await tracker.actionCodes()).not.toContain('resubmit_with_evidence');
    expect(await tracker.actionCodes()).not.toContain('add_photos');
    await expect(tracker.root).not.toContainText(ADVERSE_TEXT);
    await screenshot(page, testInfo, 'E2E-08b-technical-hold');
    await expectNeverAdverse(page);

    const progress = await harness.api<{ progress: { stages: { id: string; explanationKey: string }[] } }>('GET', `/claims/${seeded.claimId}/progress`, farmer.accessToken);
    expect(progress.data?.progress.stages.find((stage) => stage.id === 'decision')?.explanationKey).toBe(scenario.expected.decisionExplanationKey);
  });
});
