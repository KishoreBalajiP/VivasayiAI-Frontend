import { expect, test } from './fixtures';
import { edgeDelta, horizontalOverflow } from './lib/layout';

// UX-04 (chat shell). Two independent guarantees:
//   1. Layout — the workspace header, the message column and the composer content sit on ONE
//      vertical axis (they share the same max-width and gutter, so the header no longer hugs the
//      pane edge); the history sidebar reads as a distinct panel; on phones the sidebar is an
//      off-canvas drawer that opens and closes with no horizontal overflow.
//   2. Behaviour — creating, selecting, deleting and clearing chats all still work.
//
// Hermetic by construction: this spec NEVER sends a chat message. Message submission reaches the
// backend's Chroma client (services/chat.service.js), which a hermetic run must not allow, so the
// message round-trip deliberately stays out of the committed suite (see the network note in
// e2e/fixtures.ts). Layout is asserted in a real browser because jsdom has no layout engine.
//
// Runs under both projects; each test pins its own viewport so the assertions are deterministic.

const TOLERANCE = 1; // px, sub-pixel rounding only

test('UX-04: header, message column and composer share one axis, and the sidebar is a distinct panel', async ({ farmerPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/chat');

  const header = page.getByTestId('chat-header');
  const headerContent = page.getByTestId('chat-header-content');
  const column = page.getByTestId('chat-column');
  const composer = page.getByTestId('chat-composer-content');
  const sidebar = page.getByTestId('chat-sidebar');
  const surface = page.getByTestId('chat-surface');

  for (const locator of [header, column, composer, sidebar, surface]) await expect(locator).toBeVisible();

  const [headerBar, headerContentBox, columnBox, composerBox, sidebarBox] = await Promise.all([
    header.boundingBox(),
    headerContent.boundingBox(),
    column.boundingBox(),
    composer.boundingBox(),
    sidebar.boundingBox(),
  ]);
  expect(headerBar && headerContentBox && columnBox && composerBox && sidebarBox).toBeTruthy();

  const centerX = (box: { x: number; width: number }) => box.x + box.width / 2;

  // The fix: the header content and the message column are laid out from the same max-width +
  // gutter, so their boxes coincide at every width (the header used to hug the pane's left edge
  // while the column was centred).
  const headerDelta = edgeDelta(headerContentBox!, columnBox!);
  expect(headerDelta.left, 'header left edge vs message column').toBeLessThanOrEqual(TOLERANCE);
  expect(headerDelta.right, 'header right edge vs message column').toBeLessThanOrEqual(TOLERANCE);

  // The composer sits on the same centre axis. Its gutters are applied outside the max-width, so
  // compare centres (its box is one gutter wider than the column's on narrow screens).
  expect(Math.abs(centerX(composerBox!) - centerX(columnBox!)), 'composer shares the column centre').toBeLessThanOrEqual(TOLERANCE);

  // The header bar is full-bleed (wider than its centred content) — one workspace band.
  expect(headerBar!.width).toBeGreaterThan(headerContentBox!.width);

  // Sidebar is anchored at the workspace's left edge and is a different surface from the canvas.
  expect(Math.round(sidebarBox!.x)).toBe(0);
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(columnBox!.x + 1);
  const [sidebarBg, headerBg, canvasBg] = await Promise.all([
    sidebar.evaluate((el) => getComputedStyle(el).backgroundColor),
    header.evaluate((el) => getComputedStyle(el).backgroundColor),
    surface.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(sidebarBg, 'sidebar and chat canvas must not share one flat surface').not.toBe(canvasBg);
  expect(headerBg, 'header and sidebar share the elevated surface token').toBe(sidebarBg);

  // Sidebar history and the conversation scroll independently (two separate scroll containers).
  const scrollContainers = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="chat-list"]');
    const main = document.querySelector('[data-testid="chat-scroll"]');
    const overflowOf = (el: Element | null) => (el ? getComputedStyle(el).overflowY : null);
    return { list: overflowOf(list), main: overflowOf(main), distinct: list !== null && list !== main };
  });
  expect(scrollContainers.distinct).toBe(true);
  expect(scrollContainers.list === 'auto' || scrollContainers.list === 'scroll').toBe(true);
  expect(scrollContainers.main === 'auto' || scrollContainers.main === 'scroll').toBe(true);

  expect(await horizontalOverflow(page), 'chat shell: elements beyond the viewport').toEqual([]);
});

test('UX-04 (phone): the history is an off-canvas drawer that opens and closes without overflow', async ({ farmerPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/chat');

  const sidebar = page.getByTestId('chat-sidebar');
  await expect(page.getByTestId('chat-surface')).toBeVisible();

  // Anchored off-canvas (translated fully past the left edge) until the drawer is opened.
  const offCanvas = await sidebar.boundingBox();
  expect(offCanvas!.x + offCanvas!.width).toBeLessThanOrEqual(1);
  expect(await horizontalOverflow(page), 'chat shell (drawer closed)').toEqual([]);

  await page.getByRole('button', { name: 'Open chat history' }).click();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.x))
    .toBe(0);
  await expect(page.getByRole('button', { name: 'Close chat history' })).toBeVisible();

  await page.getByRole('button', { name: 'Close chat history' }).click();
  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return Math.round(box!.x + box!.width);
    })
    .toBeLessThanOrEqual(1);

  // The header content, column and composer stay on one axis on a phone too (centres coincide;
  // the composer's gutters sit outside its max-width, so compare centres, not edges).
  const [headerContentBox, columnBox, composerBox] = await Promise.all([
    page.getByTestId('chat-header-content').boundingBox(),
    page.getByTestId('chat-column').boundingBox(),
    page.getByTestId('chat-composer-content').boundingBox(),
  ]);
  const centerX = (box: { x: number; width: number }) => box.x + box.width / 2;
  expect(Math.abs(headerContentBox!.x - columnBox!.x), 'header shares the column axis').toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(centerX(composerBox!) - centerX(columnBox!)), 'composer shares the column centre').toBeLessThanOrEqual(TOLERANCE);
  expect(await horizontalOverflow(page), 'chat shell (phone)').toEqual([]);
});

test('UX-04: creating, selecting, deleting and clearing chats still work', async ({ farmerPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/chat');

  const list = page.getByTestId('chat-list');
  const chatCards = list.getByText('New Chat'); // a freshly created session keeps this default title
  const deleteButtons = page.getByRole('button', { name: 'Delete chat' });
  const headerTitle = page.getByTestId('chat-header').getByRole('heading');

  await expect(list.getByText('No chats yet')).toBeVisible();
  await expect(headerTitle).toHaveText('Tamil Nadu Farming Assistant');

  // Create two chats.
  await page.getByRole('button', { name: 'New Chat' }).click();
  await expect(chatCards).toHaveCount(1);
  await page.getByRole('button', { name: 'New Chat' }).click();
  await expect(chatCards).toHaveCount(2);

  // Select the first chat — the header stops showing the app title and shows the conversation.
  await chatCards.first().click();
  await expect(headerTitle).toHaveText('Chat');

  // Delete one chat (armed-then-confirmed destructive flow).
  await deleteButtons.first().click();
  await expect(list.getByText('Delete this chat?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(chatCards).toHaveCount(1);

  // Clear All — back to the empty state.
  await page.getByRole('button', { name: 'Clear All Chats' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(list.getByText('No chats yet')).toBeVisible();
  await expect(headerTitle).toHaveText('Tamil Nadu Farming Assistant');
});
