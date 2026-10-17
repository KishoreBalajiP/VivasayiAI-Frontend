// S20 (mobile and desktop tracker): E2E-21 (design-testing note 6). Runs on both projects:
// desktop-chromium (1440x900) and mobile-chromium (Pixel 7). No horizontal overflow, every stage
// visible, every header control has an accessible name, and the keyboard focus ring is visible on
// the dark header (white outline, critique: brand-700 would be ~1.8:1 on brand-900).

import type { Page } from '@playwright/test';
import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage, STAGE_IDS } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';

/** Elements that stick out of the viewport horizontally (ignoring clipped and screen-reader-only ones). */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => {
    const width = window.innerWidth;
    const offenders: string[] = [];
    if (document.documentElement.scrollWidth > width) offenders.push(`document scrollWidth ${document.documentElement.scrollWidth} > ${width}`);
    const clippedByAncestor = (element: Element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) && node !== document.body && node !== document.documentElement) {
          const rect = node.getBoundingClientRect();
          if (rect.right <= width + 1) return true;
        }
      }
      return false;
    };
    for (const element of Array.from(document.querySelectorAll('body *'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || style.visibility === 'hidden') continue;
      if (rect.width <= 1 && rect.height <= 1) continue; // sr-only
      if (rect.right > width + 1 && !clippedByAncestor(element)) {
        offenders.push(`${element.tagName.toLowerCase()}${element.getAttribute('data-testid') ? `[data-testid=${element.getAttribute('data-testid')}]` : ''} right=${Math.round(rect.right)}`);
      }
    }
    return offenders.slice(0, 20);
  });

test('E2E-21: the tracker, list and wizard fit the screen, stages are visible, header controls are named and the focus ring shows on the dark header', async ({ farmerPage: page, harness, farmer }, testInfo) => {
  await harness.scenario({ id: 'S13' });
  const seeded = await harness.seedClaim({ accessToken: farmer.accessToken, scenario: 'S13' });
  await harness.waitForInspection(seeded.claimId, (inspection) => inspection.settled.decided, { what: 'decided' });
  const project = testInfo.project.name;

  const tracker = new ClaimTrackerPage(page);
  await tracker.goto(seeded.claimId);
  await tracker.expectOverall('decided');
  await expect(tracker.stages).toHaveCount(STAGE_IDS.length);
  for (const id of STAGE_IDS) {
    const stage = tracker.stage(id);
    await stage.scrollIntoViewIfNeeded();
    await expect(stage).toBeVisible();
  }
  await expect(tracker.satellite).toBeVisible();
  expect(await horizontalOverflow(page), 'tracker: elements beyond the viewport').toEqual([]);
  await screenshot(page, testInfo, `E2E-21-tracker-${project}`);

  // Header: every control has an accessible name (icon-only labels on phones stay in the a11y tree).
  const header = page.locator('header[data-surface="dark"]');
  const nav = header.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Assistant' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Claims' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-current', 'page');
  const buttons = header.getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let index = 0; index < count; index += 1) await expect(buttons.nth(index)).toHaveAccessibleName(/\S/);

  // Keyboard focus on the dark header draws a visible WHITE ring.
  await page.locator('body').click({ position: { x: 1, y: 200 } }).catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let ring: { inHeader: boolean; outlineStyle: string; outlineWidth: string; outlineColor: string; name: string } | null = null;
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    ring = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return null;
      const style = getComputedStyle(active);
      return {
        inHeader: Boolean(active.closest('header[data-surface="dark"]')) && !active.closest('[data-surface="light"]'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        name: active.getAttribute('aria-label') ?? active.textContent?.trim() ?? active.tagName,
      };
    });
    if (ring?.inHeader) break;
  }
  expect(ring?.inHeader, 'Tab reaches a header control').toBe(true);
  expect(ring?.outlineStyle, `focus ring style on "${ring?.name}"`).toBe('solid');
  expect(parseFloat(ring?.outlineWidth ?? '0')).toBeGreaterThanOrEqual(2);
  expect(ring?.outlineColor, 'white ring on the dark header').toBe('rgb(255, 255, 255)');
  await screenshot(page, testInfo, `E2E-21-header-focus-${project}`);

  // The claims list and the wizard fit too.
  await page.goto('/#/claims');
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1);
  expect(await horizontalOverflow(page), 'claims list: elements beyond the viewport').toEqual([]);
  await screenshot(page, testInfo, `E2E-21-list-${project}`);

  const wizard = new ClaimWizardPage(page);
  await wizard.goto();
  await wizard.expectStep('relationship');
  expect(await horizontalOverflow(page), 'wizard: elements beyond the viewport').toEqual([]);
  await expect(wizard.continueButton).toBeInViewport();
  await screenshot(page, testInfo, `E2E-21-wizard-${project}`);
});
