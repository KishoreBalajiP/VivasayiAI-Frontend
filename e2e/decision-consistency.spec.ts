// S24 (the final decision matches the deterministic policy): E2E-25 (design-testing note 11).
// For EVERY row of the backend's scripts/e2e/scenarios.json: a fresh farmer, the scenario's setup,
// the claim through the real API, the worker, then three views must agree:
//   the tracker (data-overall-status, data-decision) == the API (GET /claims/:id state, /progress)
//   == scenarios.json `expected` (whose outcomes the backend's DC-* tests pin to the pure engine).
// One test per scenario (same E2E-25 id, parameterised), so a failure names its scenario.

import fs from 'node:fs';
import path from 'node:path';
import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { BACKEND_ROOT } from './lib/env';
import { Harness, type ScenariosDocument } from './lib/harness';

const DECISION_STATES = ['verified', 'partially_verified', 'rejected', 'duplicate_area', 'out_of_limit', 'more_evidence_required'];
const document = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'scripts', 'e2e', 'scenarios.json'), 'utf8')) as ScenariosDocument;

test.describe('E2E-25 decision consistency (scenarios.json)', () => {
  for (const scenario of document.scenarios) {
    test(`E2E-25: ${scenario.id} ${scenario.name}`, async ({ farmerPage: page, harness, farmer }, testInfo) => {
      expect(document.policy).toBe('v1.1-safe-ai');
      await harness.scenario({ id: scenario.id });
      const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: scenario.id });
      const inspection = await harness.waitForInspection(seeded.claimId, (current) => Harness.settled(scenario, current), {
        what: `${scenario.id} settled (${scenario.settle})`,
        timeoutMs: 150_000,
      });

      const tracker = new ClaimTrackerPage(page);
      await tracker.goto(seeded.claimId);
      await tracker.expectOverall(scenario.expected.overallStatus);
      if (scenario.expected.decision) await tracker.expectDecision(scenario.expected.decision);
      else await expect(tracker.decisionCard).toHaveCount(0);
      if (scenario.expected.satelliteStatus) await expect(tracker.satellite).toHaveAttribute('data-satellite-status', scenario.expected.satelliteStatus);
      for (const [stageId, status] of Object.entries(scenario.expected.stages ?? {})) {
        await expect(tracker.stage(stageId)).toHaveAttribute('data-stage-status', status);
      }
      await screenshot(page, testInfo, `E2E-25-${scenario.id}`);

      const uiDecision = (await tracker.decisionCard.count()) > 0 ? await tracker.decisionCard.getAttribute('data-decision') : null;
      const uiOverall = await tracker.overallStatus();
      const claim = await harness.api<{ claim: { state: string } }>('GET', `/claims/${seeded.claimId}`, farmer.accessToken);
      const progress = await harness.api<{ progress: { overallStatus: string; decision: string | null } }>('GET', `/claims/${seeded.claimId}/progress`, farmer.accessToken);
      const apiState = claim.data?.claim.state ?? null;
      const apiDecision = apiState && DECISION_STATES.includes(apiState) ? apiState : null;

      // UI == API == expected.
      expect({ ui: uiDecision, api: apiDecision }).toEqual({ ui: scenario.expected.outcome, api: scenario.expected.outcome });
      expect(uiOverall).toBe(progress.data?.progress.overallStatus);
      expect(progress.data?.progress.decision ?? null).toBe(scenario.expected.decision);
      expect(inspection.state).toBe(apiState);
      if (scenario.expected.held !== undefined) expect(inspection.assessment?.held).toBe(scenario.expected.held);
      if (scenario.expected.outcome === null) expect(apiState).toBe('submitted');
      expect(inspection.assessment?.policy?.id).toBe('v1.1-safe-ai');
      for (const [action, count] of Object.entries(scenario.expected.audits ?? {})) expect(inspection.audits[action] ?? 0, `audits.${action}`).toBe(count);
      for (const never of scenario.expected.neverShown ?? []) expect(uiDecision).not.toBe(never);
    });
  }
});
