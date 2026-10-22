// S20 (mobile and desktop tracker): E2E-21 (design-testing note 6). Runs on both projects:
// desktop-chromium (1440x900) and mobile-chromium (Pixel 7). No horizontal overflow, every stage
// visible, every header control has an accessible name, and the keyboard focus ring is visible on
// the dark header (white outline, critique: brand-700 would be ~1.8:1 on brand-900).
// E2E-21b (same file) covers UX-03: the weather strip folds away and re-expands without overflow.
// E2E-21c (same file) covers UX-09 (the header fits 360/390/412 with no clipped control and every
// control keeps an accessible name) and D1 (the header/weather containers are full-bleed and share
// the workspace's axis, while the chat column keeps a readable fixed max width).

import { expect, screenshot, test } from './fixtures';
import { ClaimTrackerPage, STAGE_IDS } from './pages/ClaimTrackerPage';
import { ClaimWizardPage } from './pages/ClaimWizardPage';
import { horizontalOverflow } from './lib/layout';

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

// UX-03: the farm-first weather strip can be folded away (and re-expanded) so it cannot eat the
// chat area on a phone. The source line and its controls stay available while folded, and folding
// never introduces horizontal overflow.
test('E2E-21b: the weather strip folds away and re-expands without horizontal overflow', async ({ farmerPage: page }, testInfo) => {
  await page.goto('/#/chat');
  const panel = page.getByTestId('weather-panel');
  await expect(panel).toBeVisible();

  const toggle = page.getByTestId('weather-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAccessibleName(/\S/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('data-weather-expanded', 'true');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('data-weather-expanded', 'false');
  await expect(page.getByRole('button', { name: /Use my current location|Use farm district/ })).toBeVisible();
  expect(await horizontalOverflow(page), 'folded weather strip: elements beyond the viewport').toEqual([]);
  await screenshot(page, testInfo, `E2E-21b-weather-folded-${testInfo.project.name}`);

  await toggle.click();
  await expect(panel).toHaveAttribute('data-weather-expanded', 'true');
});

// UX-09: at the narrowest phones the header must not clip a control or wrap to a second row.
// Brand wordmark, farm-chip label and nav labels collapse to sr-only below 640px (their icon
// remains, the accessible name stays). D1: the app shell is full-bleed, so the header and weather
// containers span the workspace width instead of floating centred, and the chat column keeps its
// readable max width.
test('E2E-21c: UX-09 header fits 360/390/412 with no clipped controls, and D1 the shell is full-bleed', async ({ farmerPage: page }, testInfo) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('chat-surface')).toBeVisible();

  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByTestId('chat-surface')).toBeVisible();
    expect(await horizontalOverflow(page), `page overflow at ${width}`).toEqual([]);

    const header = page.locator('header[data-surface="dark"]');
    const metrics = await header.evaluate((el) => {
      const inner = el.firstElementChild as HTMLElement;
      const box = (b: Element) => {
        const r = b.getBoundingClientRect();
        return { name: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '', x: r.x, right: r.right, w: r.width };
      };
      return {
        headerScrollW: el.scrollWidth,
        headerClientW: el.clientWidth,
        rowHeight: el.getBoundingClientRect().height,
        buttons: Array.from(inner.querySelectorAll('button')).map(box),
      };
    });
    expect(metrics.headerScrollW, `header does not scroll horizontally at ${width}`).toBeLessThanOrEqual(metrics.headerClientW + 1);
    expect(metrics.rowHeight, `header stays a single row at ${width}`).toBeLessThanOrEqual(64);
    for (const button of metrics.buttons) {
      expect(button.name, `"${button.name}" keeps an accessible name at ${width}`).toMatch(/\S/);
      expect(button.w, `"${button.name}" is not collapsed at ${width}`).toBeGreaterThan(0);
      expect(button.x, `"${button.name}" is inside the left edge at ${width}`).toBeGreaterThanOrEqual(-0.5);
      expect(button.right, `"${button.name}" is inside the right edge at ${width}`).toBeLessThanOrEqual(width + 0.5);
    }
    await screenshot(page, testInfo, `E2E-21c-header-${width}-${testInfo.project.name}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('chat-surface')).toBeVisible();
  const gutters = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
    };
    return {
      headerInner: box(document.querySelector('header[data-surface="dark"]')?.firstElementChild ?? null),
      weatherInner: box(document.querySelector('[data-testid="weather-panel"] > div')),
      chatColumn: box(document.querySelector('[data-testid="chat-column"]')),
    };
  });
  expect(gutters.headerInner, 'header container').toMatchObject({ x: 0, w: 1440 });
  expect(gutters.weatherInner, 'weather container').toEqual({ x: 0, right: 1440, w: 1440 });
  expect(gutters.chatColumn?.w ?? 0, 'chat column keeps a readable max width').toBeLessThanOrEqual(800);
  await screenshot(page, testInfo, `E2E-21c-shell-${testInfo.project.name}`);
});
