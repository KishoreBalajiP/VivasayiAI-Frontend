// S11 (area limits) and S12 (duplicate or overlapping claims): E2E-12, E2E-13.
// Drawing on the map is covered by FE unit tests (parcelGeometry.test.ts); here the geometry comes
// from the harness (POST /__e2e/seed-claim), which creates the claim through the real API.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { enV2 } from '../src/locales/v2.en';
import { taV2 } from '../src/locales/v2.ta';

test.describe('Area limits and overlaps', () => {
  test('E2E-12: an over-limit claim shows the out_of_limit decision card in English and Tamil', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    await harness.scenario({ id: 'S11' });
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S11' });
    await harness.waitForInspection(seeded.claimId, (inspection) => inspection.settled.decided, { what: 'S11 decided' });

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('out_of_limit');
    await expect(tracker.decisionCard).toContainText('Out of limit');
    // The persisted result's own reason (decisionReason_remainingCheck), not a generic sentence.
    await expect(tracker.decisionCard).toContainText(enV2.decisionReason_remainingCheck);
    await screenshot(page, testInfo, 'E2E-12-out-of-limit-en');

    // The same claim in Tamil (header language switch): same API value, Tamil words.
    await page.getByRole('group', { name: 'Change Language' }).getByRole('button', { name: 'தமிழ்' }).click();
    await expect(tracker.decisionCard).toHaveAttribute('data-decision', 'out_of_limit');
    await expect(tracker.decisionCard).toContainText('வரம்பு மீறியது');
    await expect(tracker.decisionCard).toContainText(taV2.decisionReason_remainingCheck);
    await expect(tracker.decisionCard).not.toContainText('Out of limit');
    await expect(tracker.decisionCard).not.toContainText(enV2.decisionReason_remainingCheck);
    await screenshot(page, testInfo, 'E2E-12-out-of-limit-ta');

    const api = await harness.api<{ claim: { state: string } }>('GET', `/claims/${seeded.claimId}`, farmer.accessToken);
    expect(api.data?.claim.state).toBe('out_of_limit');
  });

  test("E2E-13: an overlap with another farmer's claim is verified under v1.1, flagged for admins, and shows nothing of the other farmer", async ({ farmerPage: page, harness, farmer, network }, testInfo) => {
    await harness.scenario({ id: 'S12' });
    // The harness first files and submits a NEIGHBOUR's claim over the same land, then this farmer's.
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S12' });
    expect(seeded.neighbour).not.toBeNull();
    const neighbour = seeded.neighbour!;
    await harness.waitForInspection(seeded.claimId, (inspection) => inspection.settled.decided, { what: 'S12 decided' });

    // Every API answer this farmer's browser receives, to prove none carries the neighbour's data.
    const bodies: string[] = [];
    page.on('response', async (response) => {
      if (!response.url().startsWith(harness.apiUrl)) return;
      try {
        bodies.push(await response.text());
      } catch {
        // redirects / aborted bodies carry nothing
      }
    });

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await page.goto('/#/claims');
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('decided');
    await screenshot(page, testInfo, 'E2E-13-verified');

    const inspection = await harness.inspect(seeded.claimId);
    expect(inspection.state).toBe('verified');
    expect(inspection.audits.cross_farmer_overlap_flagged, 'admin-only overlap audit row').toBe(1);

    const forbidden = [neighbour.claimId, neighbour.cognitoSub, 'E2E Neighbour'];
    const html = await page.content();
    for (const value of forbidden) {
      expect(html, `farmer B's page shows ${value}`).not.toContain(value);
      expect(bodies.filter((body) => body.includes(value)), `API answers to farmer B containing ${value}`).toEqual([]);
      expect(network.requests.filter((request) => request.url.includes(value)), `requests naming ${value}`).toEqual([]);
    }
    expect(bodies.length).toBeGreaterThan(0);
  });
});
