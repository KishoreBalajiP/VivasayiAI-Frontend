// S04 (worker crash recovery): E2E-11, against the SECOND harness whose verification worker is a
// separate process (`--worker=process`, scripts/worker.js with the fake-Gemini preload; the D7
// deployment shape). The worker is SIGKILLed while it is in the middle of the photo check, restarted,
// and the job is taken over once its lease expires. The farmer's tracker, left open the whole time,
// goes from in progress to decided by polling alone, and exactly one decision is recorded.
//
// The Vite build targets the inline harness (18080); this spec routes the page's API calls to the
// process harness (18082). Both run the same app with the same CORS settings.

import { expect, screenshot, signIn, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { API_URL, PROCESS_API_URL, PROCESS_CONTROL_URL } from './lib/env';
import { Harness } from './lib/harness';

test('E2E-11: a process worker killed mid-step is restarted and the open tracker completes with one decision', async ({ page, context }, testInfo) => {
  const processHarness = new Harness(undefined, PROCESS_CONTROL_URL, PROCESS_API_URL);
  const health = await processHarness.health();
  expect(health.worker.mode).toBe('process');
  await processHarness.scenario({ reset: true });
  if ((await processHarness.worker('status')).state !== 'running') await processHarness.worker('start');
  const startsBefore = (await processHarness.worker('status')).starts;

  try {
    // The claim is filed while the worker process is stopped, and the tracker is opened on it.
    await processHarness.worker('pause');
    const farmer = await processHarness.session({ role: 'farmer' });
    await context.route(`${API_URL}/**`, (route) => route.continue({ url: route.request().url().replace(API_URL, PROCESS_API_URL) }));
    await signIn(context, farmer);
    const seeded = await processHarness.seedClaim({ accessToken: farmer.accessToken });
    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('in_progress');

    // A slow provider (each photo-check attempt lasts until the per-image timeout), so the kill lands
    // while the first attempt is running in the worker process.
    await processHarness.scenario({ ai: 'timeout' });
    await processHarness.worker('start');
    const running = await processHarness.waitForInspection(
      seeded.claimId,
      (inspection) => inspection.jobs.some((job) => job.step === 'ai_assessment' && job.status === 'running'),
      { what: 'photo check running in the worker process', intervalMs: 50, timeoutMs: 30_000 }
    );
    expect(running.jobs.find((job) => job.step === 'ai_assessment')?.attempts).toBe(1);
    const killed = await processHarness.worker('kill');
    expect(killed.state).toBe('killed');
    expect(killed.lastExit?.signal).toBe('SIGKILL');

    // Nobody is working on the claim now: the job is still "running" under a dead lease.
    const orphaned = await processHarness.inspect(seeded.claimId);
    expect(orphaned.jobs.find((job) => job.step === 'ai_assessment')?.status).toBe('running');
    expect(orphaned.state).toBe('submitted');
    await screenshot(page, testInfo, 'E2E-11-worker-killed');

    // The provider is healthy again and a new worker process starts.
    await processHarness.scenario({ ai: 'damage' });
    const restarted = await processHarness.worker('start');
    expect(restarted.state).toBe('running');
    expect(restarted.starts).toBe(startsBefore + 2); // the start above, and this restart

    // The tracker (never reloaded, nothing clicked) reaches the decision.
    await tracker.expectOverall('decided', 120_000);
    await tracker.expectDecision('verified');
    await screenshot(page, testInfo, 'E2E-11-decided-after-restart');

    const inspection = await processHarness.inspect(seeded.claimId);
    expect(inspection.state).toBe('verified');
    expect(inspection.audits.verified, 'one decision').toBe(1);
    expect(inspection.audits.submitted).toBe(1);
    const photoJob = inspection.jobs.find((job) => job.step === 'ai_assessment');
    expect(photoJob?.status).toBe('succeeded');
    expect(photoJob?.attempts, 'the killed attempt plus the takeover').toBe(2);
    expect(await processHarness.networkViolations()).toEqual([]);
  } finally {
    await processHarness.scenario({ reset: true }).catch(() => undefined);
    const status = await processHarness.worker('status').catch(() => null);
    if (status && status.state !== 'running') await processHarness.worker('start').catch(() => undefined);
  }
});
