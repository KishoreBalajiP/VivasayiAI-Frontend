// S17 (unauthorized access to another farmer's claim): E2E-18.
// Farmer B opens farmer A's deep link. The backend answers 404 for every owner-scoped read, and the
// page says the claim cannot be found without rendering any of A's data.

import { expect, screenshot, test, uniqueName } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';

test("E2E-18: a foreign claim's deep link shows 'This claim could not be found.' and every read is a 404", async ({ farmerPage: page, harness, network }, testInfo) => {
  // Farmer A (not the page's farmer) with a decided claim and a recognisable parcel name.
  const parcelName = uniqueName('Farmer A field', testInfo);
  const farmerA = await harness.session({ role: 'farmer', name: 'Farmer A Owner', parcel: { name: parcelName } });
  const theirs = await harness.seedClaim({ accessToken: farmerA.accessToken });
  await harness.waitForInspection(theirs.claimId, (inspection) => inspection.settled.decided, { what: "farmer A's claim decided" });
  const before = await harness.inspect(theirs.claimId);

  const tracker = new ClaimTrackerPage(page);
  await page.goto(`/#/claims/${theirs.claimId}`);
  await expect(page.getByText('This claim could not be found.')).toBeVisible();
  await expect(tracker.root).toHaveAttribute('data-claim-id', theirs.claimId);
  await expect(tracker.decisionCard).toHaveCount(0);
  await expect(tracker.stages).toHaveCount(0);
  await expect(tracker.satellite).toHaveCount(0);
  await expect(tracker.root).not.toHaveAttribute('data-overall-status', /.+/);
  await screenshot(page, testInfo, 'E2E-18-not-found');

  const html = await page.content();
  for (const value of [parcelName, farmerA.user.name, farmerA.user.email, farmerA.user.cognitoSub]) expect(html).not.toContain(value);

  // Every owner-scoped read of A's claim answered 404 (and no write was attempted).
  const reads = network.responses.filter((response) => response.method === 'GET' && response.url.includes(theirs.claimId));
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.map((response) => `${response.method} ${new URL(response.url).pathname} ${response.status}`).filter((line) => !line.endsWith(' 404'))).toEqual([]);
  const paths = reads.map((response) => new URL(response.url).pathname);
  expect(paths).toContain(`/claims/${theirs.claimId}/progress`);
  expect(paths).toContain(`/claims/${theirs.claimId}/verification`);
  expect(network.requests.filter((request) => request.method !== 'GET' && request.method !== 'OPTIONS' && request.url.includes(theirs.claimId))).toEqual([]);

  // Nothing changed on A's claim.
  const after = await harness.inspect(theirs.claimId);
  expect(after.audits).toEqual(before.audits);
  expect(after.jobs).toEqual(before.jobs);
});
