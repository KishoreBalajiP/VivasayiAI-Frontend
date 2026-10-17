// S01 (valid submission + automatic job): E2E-01, E2E-02, E2E-05.
// The farmer submits through the wizard and the WORKER decides the claim: the browser never calls
// POST /claims/:id/verify and no verify control exists anywhere in the farmer UI.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';
import { utcDateDaysAgo } from './lib/harness';

const VERIFY_PATH = /^\/claims\/[^/]+\/verify$/;

test.describe('S01 automatic verification after submit', () => {
  test('E2E-01: wizard to tracker to decided, with zero POST /verify requests', async ({ farmerPage: page, harness, network, farmer }, testInfo) => {
    await harness.scenario({ id: 'S01' });
    const wizard = new ClaimWizardPage(page);
    await wizard.goto();
    await wizard.expectParcelAutoSelected();
    await wizard.chooseRelationship('I own this land');
    await wizard.next('event');
    await wizard.describeEvent({ type: 'Flood', date: utcDateDaysAgo(3) });
    await wizard.next('evidence');
    await expect(wizard.continueButton).toBeDisabled(); // no photo yet
    await wizard.addPhotos([
      { name: 'crop-1.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-p1`) },
      { name: 'crop-2.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-p2`) },
    ]);
    await expect(wizard.photos()).toHaveCount(2);
    await wizard.addDocuments([{ name: 'patta.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-d1`, 600, 800) }]);
    await expect(wizard.documents()).toHaveCount(1);
    await wizard.next('review');
    await expect(wizard.root).toContainText('Flood');
    await expect(wizard.root).toContainText('I own this land');
    await screenshot(page, testInfo, 'E2E-01-review');
    await wizard.submit();
    const claimId = await wizard.waitForTracker();

    const tracker = new ClaimTrackerPage(page);
    await expect(tracker.root).toHaveAttribute('data-claim-id', claimId);
    await tracker.expectNoVerifyButton();
    // Polling alone brings the worker's decision: nothing is clicked from here on.
    await tracker.expectOverall('decided', 90_000);
    await tracker.expectDecision('verified');
    await expect(tracker.stage('received')).toHaveAttribute('data-stage-status', 'complete');
    await expect(tracker.stage('photos')).toHaveAttribute('data-stage-status', 'complete');
    await expect(tracker.stage('land_documents')).toHaveAttribute('data-stage-status', 'complete');
    await expect(tracker.stage('decision')).toHaveAttribute('data-stage-status', 'complete');
    // Satellite is supporting only and analysis is off in this environment: never "passed" here.
    await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'unavailable');
    await tracker.expectNoVerifyButton();
    await screenshot(page, testInfo, 'E2E-01-decided');

    // The decision came from the worker, not from the browser.
    expect(network.matching('POST', VERIFY_PATH), 'POST /claims/:id/verify requests').toEqual([]);
    expect(network.matching('POST', /^\/claims$/)).toHaveLength(1);
    expect(network.matching('POST', /^\/claims\/[^/]+\/submit$/)).toHaveLength(1);
    // The photo bytes went to the harness's signed dev receiver (loopback), with the signed type.
    const puts = network.matching('PUT', /^\/__dev\/storage\//);
    expect(puts.length).toBe(3);
    expect(puts.every((request) => request.url.startsWith(harness.apiUrl))).toBe(true);

    const inspection = await harness.inspect(claimId);
    expect(inspection.state).toBe('verified');
    expect(inspection.audits.submitted).toBe(1);
    expect(inspection.audits.verified).toBe(1);
    expect(inspection.assessment?.policy?.id).toBe('v1.1-safe-ai');
    const api = await harness.api<{ claim: { state: string } }>('GET', `/claims/${claimId}`, farmer.accessToken);
    expect(api.data?.claim.state).toBe('verified');
  });

  test('E2E-02: no verify button is rendered for a draft, a claim being checked, or a decided claim', async ({ farmerPage: page, harness, farmer, network }, testInfo) => {
    const tracker = new ClaimTrackerPage(page);

    // Being checked: the worker is paused, so the submitted claim stays in progress.
    await harness.worker('pause');
    const submitted = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S01' });
    await tracker.goto(submitted.claimId);
    await tracker.expectOverall('in_progress');
    await tracker.expectNoVerifyButton();
    await screenshot(page, testInfo, 'E2E-02-in-progress');

    // A draft (saved, not submitted): "Submit claim" is offered (plus the optional land-document
    // recommendation under v1.1), and nothing that runs verification.
    const draft = await harness.seedClaim({ accessToken: farmer.accessToken, submit: false });
    await tracker.goto(draft.claimId);
    await tracker.expectOverall('draft');
    const codes = await tracker.actionCodes();
    expect(codes).toContain('submit_claim');
    expect(codes.every((code) => ['submit_claim', 'add_photos', 'upload_land_documents'].includes(code))).toBe(true);
    await tracker.expectNoVerifyButton();
    await screenshot(page, testInfo, 'E2E-02-draft');

    // Decided.
    await tracker.goto(submitted.claimId);
    await harness.worker('resume');
    await harness.waitForInspection(submitted.claimId, (inspection) => inspection.settled.decided, { what: 'decided' });
    await tracker.expectOverall('decided', 60_000);
    await tracker.expectNoVerifyButton();

    // The claims list has none either.
    await page.goto('/#/claims');
    await expect(page.getByRole('heading', { name: 'My Claims' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run AI verification/ })).toHaveCount(0);
    expect(network.matching('POST', VERIFY_PATH)).toEqual([]);
  });

  test('E2E-05: ten photos and two land documents fit the default rate limits in the browser', async ({ farmerPage: page, harness, network }, testInfo) => {
    await harness.scenario({ id: 'S01' });
    const wizard = new ClaimWizardPage(page);
    await wizard.goto();
    await wizard.expectParcelAutoSelected();
    await wizard.chooseRelationship('I farm it on lease (tenant)');
    await wizard.next('event');
    await wizard.describeEvent({ type: 'Flood', date: utcDateDaysAgo(2) });
    await wizard.next('evidence');
    const photos = await Promise.all(
      Array.from({ length: 10 }, async (_, index) => ({
        name: `crop-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: await harness.fixtureImage(`${testInfo.testId}-p${index}`, 640, 480),
      }))
    );
    await wizard.addPhotos(photos);
    await expect(wizard.photos()).toHaveCount(10);
    await wizard.addDocuments([
      { name: 'lease.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-d1`, 600, 800) },
      { name: 'patta.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-d2`, 600, 800) },
    ]);
    await expect(wizard.documents()).toHaveCount(2);
    await wizard.next('review');
    await wizard.submit();
    const claimId = await wizard.waitForTracker(120_000);

    const tracker = new ClaimTrackerPage(page);
    await tracker.expectOverall('decided', 90_000);
    await tracker.expectDecision('verified');
    await screenshot(page, testInfo, 'E2E-05-decided');

    // Every upload and API call stayed inside the D5 defaults: no 429 anywhere.
    expect(network.responses.filter((response) => response.status === 429)).toEqual([]);
    expect(network.matching('PUT', /^\/__dev\/storage\//)).toHaveLength(12);
    const inspection = await harness.inspect(claimId);
    expect(inspection.audits.evidence_completed).toBe(10);
    expect(inspection.audits.submitted).toBe(1);
    await expect(tracker.stage('land_documents')).toHaveAttribute('data-stage-status', 'complete');
  });
});
