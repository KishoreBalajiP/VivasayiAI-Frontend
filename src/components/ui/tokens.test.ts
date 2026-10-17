import { describe, expect, it } from 'vitest';
import type { Config } from 'tailwindcss';
import { TONES } from './tones';

// The tokens the primitives depend on must exist in tailwind.config.js, otherwise Tailwind
// silently drops classes such as `bg-danger-solid` and a state loses its colour. Loaded through
// import.meta.glob so the JS config needs no type declaration.
const modules = import.meta.glob<Config>('/tailwind.config.js', { eager: true, import: 'default' });
const config = Object.values(modules)[0];

type ColorScale = Record<string, unknown>;

describe('design tokens', () => {
  it('UI-9: the config is found and only EXTENDS the theme (stock classes keep working)', () => {
    expect(config).toBeDefined();
    const theme = config.theme as Record<string, unknown>;
    expect(Object.keys(theme)).toEqual(['extend']);
  });

  it('UI-9: semantic tones each define fg, bg, border and solid; brand/ink/surface exist', () => {
    const colors = (config.theme as { extend: { colors: Record<string, ColorScale> } }).extend.colors;
    for (const tone of TONES) {
      expect(Object.keys(colors[tone]).sort()).toEqual(['bg', 'border', 'fg', 'solid']);
    }
    expect(colors.brand['700']).toBeTruthy();
    expect(Object.keys(colors.ink)).toEqual(expect.arrayContaining(['DEFAULT', 'muted', 'subtle']));
    expect(Object.keys(colors.surface)).toEqual(expect.arrayContaining(['DEFAULT', 'muted', 'sunken', 'border']));
    // `neutral` is Tailwind's own palette and must not be redefined.
    expect(colors.neutral).toBeUndefined();
  });

  it('UI-9: radius, 2xs type size, card shadow and the Tamil-capable font stack are defined', () => {
    const extend = (config.theme as { extend: Record<string, Record<string, unknown>> }).extend;
    expect(extend.borderRadius).toMatchObject({ control: expect.any(String), card: expect.any(String) });
    expect(extend.fontSize['2xs']).toBeDefined();
    expect(extend.boxShadow.card).toBeDefined();
    expect(extend.fontFamily.sans).toEqual(expect.arrayContaining(['"Noto Sans Tamil"']));
  });

  // WCAG 1.4.11: a focus indicator needs 3:1 against what is next to it. The global ring is
  // brand-700, fine on light surfaces but ~1.8:1 on the brand-900 header, so index.css turns it
  // white inside [data-surface="dark"] (the header; checked by UI-10 in Navbar.test.tsx).
  it('UI-9: keyboard focus rings reach 3:1 — brand-700 on light surfaces, white on the dark header', () => {
    const colors = (config.theme as { extend: { colors: Record<string, Record<string, string>> } }).extend.colors;
    const ring = colors.brand['700'];
    for (const surface of ['#ffffff', colors.surface.muted, colors.surface.sunken]) {
      expect(contrast(ring, surface), `brand-700 on ${surface}`).toBeGreaterThanOrEqual(3);
    }
    // Why the header needs its own ring: the default one is effectively invisible there.
    expect(contrast(ring, colors.brand['900'])).toBeLessThan(3);
    expect(contrast(ring, colors.brand['800'])).toBeLessThan(3);
    for (const shade of ['700', '800', '900']) {
      expect(contrast('#ffffff', colors.brand[shade]), `white on brand-${shade}`).toBeGreaterThanOrEqual(3);
    }
  });

  // The rules themselves, read from index.css (vitest.config.ts lets this one stylesheet through
  // raw). A real-browser check of the rendered ring is part of the Playwright pass.
  it('UI-9: index.css draws brand-700 globally, white inside a dark surface and brand-700 again in a light panel nested in it', () => {
    const css = Object.values(stylesheet)[0];
    expect(css, 'src/index.css could not be read raw').toMatch(/:focus-visible/);
    const rules = focusRules(css);

    expect(rules.get(':focus-visible')).toMatch(/outline:\s*2px solid theme\('colors\.brand\.700'\)/);
    expect(rules.get(':focus-visible')).toMatch(/outline-offset:\s*2px/);
    expect(rules.get(":where([data-surface='dark']) :focus-visible")).toMatch(/outline-color:\s*theme\('colors\.white'\)/);
    expect(rules.get(":where([data-surface='dark'] [data-surface='light']) :focus-visible")).toMatch(
      /outline-color:\s*theme\('colors\.brand\.700'\)/
    );

    // Equal specificity means source order decides: dark after the global rule, light after dark.
    const order = [...rules.keys()];
    expect(order.indexOf(":where([data-surface='dark']) :focus-visible")).toBeGreaterThan(order.indexOf(':focus-visible'));
    expect(order.indexOf(":where([data-surface='dark'] [data-surface='light']) :focus-visible")).toBeGreaterThan(
      order.indexOf(":where([data-surface='dark']) :focus-visible")
    );
    // A bare [data-surface] selector would outrank (and silently defeat) focus-visible:outline-*
    // and focus:outline-none utilities on individual controls.
    for (const selector of order) {
      expect(selector.replace(/:where\([^)]*\)/g, ''), selector).not.toMatch(/\[data-surface/);
    }
  });
});

const stylesheet = import.meta.glob<string>('/src/index.css', { query: '?raw', import: 'default', eager: true });

/** Every rule whose selector targets :focus-visible, selector → declarations, in source order. */
function focusRules(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map<string, string>();
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^{}]*)\}/g)) {
    rules.set(selector.trim(), body.trim());
  }
  return rules;
}

// Relative luminance and contrast ratio as defined by WCAG 2.x.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
