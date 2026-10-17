// S18 (human review and appeal): E2E-19a, E2E-19b. The admin works in a SECOND browser context
// (a separate signed-in session), as a reviewer would on their own machine.
//   19a: the AI reads no damage → the claim is HELD for a person (never rejected by the AI alone) →
//        the admin overrides the held claim (owner decision D8, critique B2/E3) → the farmer sees it.
//   19b: out_of_limit → the farmer appeals → the admin sees the appeal and resolves it.

import { expect, screenshot, signIn, test, uniqueName } from './fixtures';
import { AdminReviewPage } from './pages/AdminReviewPage';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { Harness } from './lib/harness';

test.describe('Human review and appeals', () => {
  test('E2E-19a: AI reads no damage: held for a person; an admin overrides it from a second session and the farmer sees the decision', async ({ page, context, harness, newContext }, testInfo) => {
    const parcelName = uniqueName('E2E held field', testInfo);
    const farmer = await harness.session({ role: 'farmer', parcel: { name: parcelName } });
    await signIn(context, farmer);
    const scenario = (await harness.scenarios()).scenarios.find((entry) => entry.id === 'S08c')!;
    await harness.scenario({ id: 'S08c' });
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S08c' });
    const held = await harness.waitForInspection(seeded.claimId, (inspection) => Harness.settled(scenario, inspection), { what: 'S08c held' });
    expect(held.state).toBe('submitted');
    expect(held.reviewCases).toBe(1);

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('waiting_for_review');
    await expect(tracker.decisionCard).toHaveCount(0);
    await expect(tracker.root).not.toContainText(/Rejected/);
    await screenshot(page, testInfo, 'E2E-19a-farmer-held');

    // The reviewer, in their own browser session.
    const admin = await harness.session({ role: 'admin', name: 'E2E Reviewer' });
    const adminContext = await newContext('admin');
    await signIn(adminContext, admin);
    const adminPage = await adminContext.newPage();
    const review = new AdminReviewPage(adminPage);
    await review.goto();
    await review.openQueue();
    await review.heldFilter.selectOption('true');
    await review.search.fill(parcelName);
    await expect(review.row(parcelName)).toHaveCount(1, { timeout: 15_000 });
    await expect(review.row(parcelName).getByTestId('queue-held-signal')).toBeVisible();
    await review.openClaimByParcelName(parcelName);
    await expect(review.heldNote).toBeVisible();
    await screenshot(adminPage, testInfo, 'E2E-19a-admin-held-detail');
    await review.override({ toState: 'verified', reason: 'Field visit confirmed flood damage across the parcel.' });
    await expect(adminPage.getByText('Override applied and recorded.')).toBeVisible();

    const decided = await harness.inspect(seeded.claimId);
    expect(decided.state).toBe('verified');
    expect(decided.audits.overridden).toBe(1);

    // A held claim is re-read every 5 minutes; the farmer's "Check for updates" reads now.
    await tracker.checkForUpdates();
    await tracker.expectOverall('decided');
    await tracker.expectDecision('verified');
    await screenshot(page, testInfo, 'E2E-19a-farmer-decided');
  });

  test('E2E-19b: out_of_limit: the farmer appeals, the admin sees the appeal and resolves it, the farmer sees the result', async ({ page, context, harness, newContext }, testInfo) => {
    const parcelName = uniqueName('E2E appeal field', testInfo);
    const farmer = await harness.session({ role: 'farmer', parcel: { name: parcelName } });
    await signIn(context, farmer);
    await harness.scenario({ id: 'S11' });
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S11' });
    await harness.waitForInspection(seeded.claimId, (inspection) => inspection.settled.decided, { what: 'S11 decided' });

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectDecision('out_of_limit');
    await page.getByRole('button', { name: 'Appeal decision' }).click();
    const reason = 'The whole field was flooded; the claimed boundary follows the bund my neighbour can confirm.';
    await page.getByLabel('Why do you think the decision is wrong?').fill(reason);
    await page.getByRole('button', { name: 'Send appeal' }).click();
    await expect(page.getByText('Appeal sent. A reviewer will look at your claim again.')).toBeVisible();
    await expect(page.getByText(/Appeal status/)).toBeVisible();
    await screenshot(page, testInfo, 'E2E-19b-farmer-appealed');

    const admin = await harness.session({ role: 'admin', name: 'E2E Reviewer' });
    const adminContext = await newContext('admin');
    await signIn(adminContext, admin);
    const adminPage = await adminContext.newPage();
    const review = new AdminReviewPage(adminPage);
    await review.goto();
    await review.openQueue();
    await review.appealFilter.selectOption('true');
    await review.search.fill(parcelName);
    await expect(review.row(parcelName)).toHaveCount(1, { timeout: 15_000 });
    await expect(review.row(parcelName)).toContainText('Appeal');
    await review.openClaimByParcelName(parcelName);
    await expect(adminPage.getByRole('heading', { name: 'Farmer appeals' })).toBeVisible();
    await expect(adminPage.getByText(reason)).toBeVisible();
    await screenshot(adminPage, testInfo, 'E2E-19b-admin-appeal');
    await review.override({ toState: 'partially_verified', reason: 'Appeal upheld in part: the eligible area is verified.' });
    await expect(adminPage.getByText('Override applied and recorded.')).toBeVisible();

    const resolved = await harness.inspect(seeded.claimId);
    expect(resolved.state).toBe('partially_verified');
    const appeal = await harness.api<{ appeal: { status: string } | null }>('GET', `/claims/${seeded.claimId}/appeal`, farmer.accessToken);
    expect(appeal.data?.appeal?.status).toBe('resolved');

    await page.reload();
    await tracker.expectOverall('decided');
    // The appeal outcome reaches the farmer as the new decision.
    await tracker.expectDecision('partially_verified');
    await screenshot(page, testInfo, 'E2E-19b-farmer-resolved');
  });
});
