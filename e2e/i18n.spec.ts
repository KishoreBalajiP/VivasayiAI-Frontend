// S19 (Tamil and English statuses): E2E-20 (design-testing note 5).
// A Tamil-speaking farmer's tracker is in Tamil: no raw translation keys, no PROVIDER_ codes, none of
// the English tracker sentences, and Tamil script dominates the tracker region. Screenshots in both
// languages. (The Tamil copy itself still needs native-speaker review; that is an owner action.)

import type { Locator } from '@playwright/test';
import { expect, screenshot, signIn, test } from './fixtures';
import { ClaimTrackerPage } from './pages/ClaimTrackerPage';
import { enV2 } from '../src/locales/v2.en';
import { taV2 } from '../src/locales/v2.ta';

const TRACKER_KEY = /^(tracker|progress_|overall|stage|satellite|action|decisionReason|stepperStatus|evidenceSummary|claimReference)/;

// English sentences of the tracker (only where Tamil differs, so a shared word is not flagged).
const englishTrackerStrings = [
  ...Object.entries(enV2)
    .filter(([key, value]) => TRACKER_KEY.test(key) && value !== taV2[key as keyof typeof taV2] && value.length >= 8 && !value.includes('{{'))
    .map(([, value]) => value),
  'Check for updates',
  'Decision made',
  'Verified',
  'Submitted',
];

const RAW_KEY = /\b(?:progress|action|technical|satellite|decision|tracker|claimState|stage|overall)[._][A-Za-z]+[._A-Za-z]*\b/;

const tamilRatio = async (region: Locator, exclude: string[]) => {
  let text = await region.innerText();
  for (const value of exclude) text = text.split(value).join(' ');
  const tamil = (text.match(/[஀-௿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return { ratio: tamil / Math.max(1, tamil + latin), tamil, latin, text };
};

const checkTamil = async (tracker: ClaimTrackerPage, exclude: string[]) => {
  const text = await tracker.root.innerText();
  expect(text, 'raw translation keys').not.toMatch(RAW_KEY);
  expect(text, 'provider error codes').not.toContain('PROVIDER_');
  const english = englishTrackerStrings.filter((value) => text.includes(value));
  expect(english, 'English tracker strings on the Tamil page').toEqual([]);
  const { ratio, tamil, latin } = await tamilRatio(tracker.root, exclude);
  expect(ratio, `Tamil-script share of letters (tamil ${tamil}, latin ${latin})`).toBeGreaterThanOrEqual(0.5);
};

test.use({ language: 'ta' });

test('E2E-20: a Tamil farmer sees every tracker status in Tamil (no raw keys or codes), with screenshots in both languages', async ({ page, context, harness }, testInfo) => {
  const parcelName = 'தஞ்சை வயல்';
  const farmer = await harness.session({ role: 'farmer', language: 'ta', parcel: { name: parcelName } });
  await signIn(context, farmer, 'ta');
  await harness.scenario({ id: 'S13' });
  await harness.worker('pause');
  const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S13' });
  const reference = seeded.claimId.slice(-8).toUpperCase();
  const exclude = [parcelName, 'Paddy', reference, 'AI'];

  const tracker = new ClaimTrackerPage(page);
  await tracker.goto(seeded.claimId);
  await tracker.expectOverall('in_progress');
  await expect(tracker.refreshButton('ta')).toBeVisible();
  await checkTamil(tracker, exclude);
  await screenshot(page, testInfo, 'E2E-20-ta-in-progress');

  await harness.worker('resume');
  await tracker.expectOverall('decided', 90_000);
  await tracker.expectDecision('verified');
  await expect(tracker.satellite).toHaveAttribute('data-satellite-status', 'passed');
  await expect(tracker.root.getByText('வரம்பு மீறியது')).toHaveCount(0);
  await checkTamil(tracker, exclude);
  await screenshot(page, testInfo, 'E2E-20-ta-decided');

  // The same claim in English.
  await page.getByRole('group', { name: 'மொழியை மாற்று' }).getByRole('button', { name: 'English' }).click();
  await expect(tracker.refreshButton('en')).toBeVisible();
  await expect(tracker.decisionCard).toHaveAttribute('data-decision', 'verified');
  const english = await tracker.root.innerText();
  expect(english).not.toMatch(RAW_KEY);
  expect(english).toContain('Check for updates');
  await screenshot(page, testInfo, 'E2E-20-en-decided');
});
