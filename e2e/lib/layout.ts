// Real-browser layout probes. jsdom has no layout engine, so alignment, overflow and surface
// colours can only be asserted in a browser — these helpers keep one definition shared by the
// responsiveness spec (E2E-21) and the chat-shell spec (UX-04).
import type { Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

/** Elements that stick out of the viewport horizontally (ignoring clipped and screen-reader-only ones). */
export const horizontalOverflow = (page: Page) =>
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

/** Distance between the left and right edges of two boxes (px) — 0 means they share one vertical axis. */
export function edgeDelta(a: Box, b: Box) {
  return { left: Math.abs(a.x - b.x), right: Math.abs(a.x + a.width - (b.x + b.width)) };
}

/** Backdrop colour of an element, as the browser resolved it (e.g. "rgb(255, 255, 255)"). */
export const backgroundColor = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => getComputedStyle(el).backgroundColor);
