// S09 (missing or invalid land documents) and S10 (missing claimant-rights evidence): E2E-09, E2E-10.

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';
import { utcDateDaysAgo } from './lib/harness';

// A minimal, valid one-page PDF (only its magic bytes matter to the client and the server).
const pdfBytes = () =>
  Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1'
  );

test.describe('Land documents', () => {
  test('E2E-09: a PDF is refused in the browser and by the server; an image document completes the land documents stage', async ({ farmerPage: page, harness, farmer, network }, testInfo) => {
    await harness.scenario({ id: 'S09' });

    // The server refuses a PDF on its own too (the browser check is convenience, not the guard).
    const pdf = pdfBytes();
    const presign = await harness.api('POST', '/upload/presign', farmer.accessToken, { contentType: 'application/pdf', size: pdf.length, filename: 'deed.pdf' });
    expect(presign.status, 'POST /upload/presign with application/pdf').toBe(400);

    const wizard = new ClaimWizardPage(page);
    await wizard.goto();
    await wizard.expectParcelAutoSelected();
    await wizard.chooseRelationship('I farm it on lease (tenant)');
    await wizard.next('event');
    await wizard.describeEvent({ type: 'Flood', date: utcDateDaysAgo(3) });
    await wizard.next('evidence');
    await wizard.addPhotos([{ name: 'crop.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-p1`) }]);

    // 1. A real PDF: refused in the browser with the "images only" reason; nothing is staged.
    await wizard.addDocuments([{ name: 'deed.pdf', mimeType: 'application/pdf', buffer: pdf }]);
    const documentMessages = wizard.root.getByTestId('wizard-document-messages');
    await expect(documentMessages).toContainText('"deed.pdf" was not added.');
    await expect(documentMessages).toContainText('PDF files cannot be added yet.');
    await expect(wizard.documents()).toHaveCount(0);
    await screenshot(page, testInfo, 'E2E-09-pdf-refused');

    // 2. A PDF renamed to .jpg passes the browser's check (the OS says image/jpeg) but not the
    //    server's byte check (400 at /upload/:id/complete): that one document fails, nothing else.
    await wizard.addDocuments([{ name: 'renamed-deed.jpg', mimeType: 'image/jpeg', buffer: pdf }]);
    // 3. A real photo of the lease.
    await wizard.addDocuments([{ name: 'lease.jpg', mimeType: 'image/jpeg', buffer: await harness.fixtureImage(`${testInfo.testId}-d1`, 600, 800) }]);
    await expect(wizard.documents()).toHaveCount(2);
    await wizard.next('review');
    await wizard.submit();

    await expect(wizard.submitError).toBeVisible({ timeout: 60_000 });
    await expect(wizard.submitError).toContainText('Some land documents could not be added');
    const completes = network.responsesMatching('POST', /^\/upload\/[^/]+\/complete$/);
    expect(completes.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(network.matching('POST', /^\/claims\/[^/]+\/submit$/), 'not submitted while a document failed').toHaveLength(0);
    await screenshot(page, testInfo, 'E2E-09-server-refused');

    // The farmer goes back, removes the refused document and submits again: what was already
    // uploaded (the photo, the lease) is not sent again.
    await wizard.root.getByTestId('wizard-footer').getByRole('button', { name: 'Back' }).click();
    await wizard.expectStep('evidence');
    const refused = wizard.documents().filter({ hasText: 'renamed-deed.jpg' });
    await expect(refused).toHaveAttribute('data-status', 'failed');
    await refused.getByRole('button', { name: 'Remove document renamed-deed.jpg' }).click();
    await expect(wizard.documents()).toHaveCount(1);
    await expect(wizard.documents().first()).toHaveAttribute('data-status', 'attached');
    await wizard.next('review');
    await wizard.submit();
    const claimId = await wizard.waitForTracker();

    const tracker = new ClaimTrackerPage(page);
    await tracker.expectOverall('decided', 90_000);
    await expect(tracker.stage('land_documents')).toHaveAttribute('data-stage-status', 'complete');
    await tracker.expectDecision('verified');
    await screenshot(page, testInfo, 'E2E-09-land-documents-complete');
    expect(network.matching('PUT', /^\/__dev\/storage\//).length).toBe(3); // photo, renamed PDF, lease: each sent once
    const documents = await harness.api<{ evidence: unknown[] }>('GET', `/claims/${claimId}/ownership`, farmer.accessToken);
    expect(documents.data?.evidence ?? []).toHaveLength(1);
  });

  test('E2E-10: a tenant without land documents sees an optional action and the decision still proceeds', async ({ farmerPage: page, harness, farmer }, testInfo) => {
    await harness.scenario({ id: 'S10' });
    await harness.worker('pause');
    const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S10' });

    const tracker = new ClaimTrackerPage(page);
    await tracker.goto(seeded.claimId);
    await tracker.expectOverall('in_progress');
    const action = tracker.root.locator('[data-testid="claim-action"][data-action-code="upload_land_documents"]');
    await expect(action).toBeVisible();
    await expect(action).toContainText('Recommended');
    await expect(action).not.toContainText('Required');
    await expect(tracker.stage('land_documents')).toHaveAttribute('data-stage-status', 'not_applicable');
    await screenshot(page, testInfo, 'E2E-10-optional-action');

    await harness.worker('resume');
    await tracker.expectOverall('decided', 90_000);
    await tracker.expectDecision('verified');
    await screenshot(page, testInfo, 'E2E-10-decided');
    const inspection = await harness.inspect(seeded.claimId);
    expect(inspection.state).toBe('verified');
  });
});
