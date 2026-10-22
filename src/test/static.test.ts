import { describe, expect, it } from 'vitest';

// Static guards over the source (UI-14). They pin down the design-system fixes so a later
// copy-paste cannot quietly bring the old patterns back. The gradient and window.confirm guards
// scan EVERY non-test source file; the files not migrated yet are listed below as known debt.
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const source = (path: string): string => {
  const text = sources[path];
  if (typeof text !== 'string') throw new Error(`missing source file ${path}`);
  return text;
};

const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.startsWith('/src/test/');

const UI_PRIMITIVES = [
  'cn.ts',
  'tones.ts',
  'Button.tsx',
  'Card.tsx',
  'StatusPill.tsx',
  'Alert.tsx',
  'Stepper.tsx',
  'EmptyState.tsx',
  'Skeleton.tsx',
  'ConfirmDialog.tsx',
  'index.ts',
];

// Known debt, as a ratchet: a listed file may keep AT MOST this many occurrences until it is moved
// onto <Button> / <ConfirmDialog>; every other source file must have none. Lower a number (or drop
// the entry) when a file is migrated; never raise one.
// (ManageParcels, FarmProfileEditor, ProfileOnboarding and MessageBubble were migrated in the
// design-system cleanup pass and are now held to zero through MIGRATED below. ClaimsPage,
// ClaimWizard and ClaimAppealPanel were migrated by the stage-2 wizard and tracker work and are
// held to zero through CLAIM_FLOW_FILES below.) Nothing is left on either list.
const GRADIENT_DEBT: Record<string, number> = {};
const WINDOW_CONFIRM_DEBT: Record<string, number> = {};

// The farmer claim flow after stage 2: no copied gradient, no window.confirm (withdraw, resubmit
// and photo removal use ConfirmDialog), no ad-hoc 10/11 px type.
const CLAIM_FLOW_FILES = [
  '/src/components/ClaimsPage.tsx',
  '/src/components/ClaimWizard.tsx',
  '/src/components/ClaimAppealPanel.tsx',
  '/src/components/ClaimEvidenceGallery.tsx',
  '/src/components/ClaimComponentChecklist.tsx',
  '/src/components/ClaimOwnershipDocuments.tsx',
  '/src/components/ClaimStatusCard.tsx',
  '/src/components/claims/ClaimTracker.tsx',
  '/src/components/claims/TrackerHeader.tsx',
  '/src/components/claims/ProgressStages.tsx',
  '/src/components/claims/ActionRequiredCallouts.tsx',
  '/src/components/claims/SatelliteCard.tsx',
  '/src/components/claims/EvidenceSummary.tsx',
];

// Code only: a comment that mentions the old pattern (e.g. "replaces window.confirm") is not a use.
// The `[^:]` keeps `https://` URLs intact.
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const GRADIENT = /from-emerald-600 to-green-700/g;
// window.confirm(…), globalThis.confirm(…) or a bare global confirm(…); not onConfirm(…) etc.
const CONFIRM_CALL = /(?:\bwindow\.|\bglobalThis\.|(?<![\w$.]))confirm\s*\(/g;

const countIn = (text: string, pattern: RegExp) => (stripComments(text).match(pattern) ?? []).length;

/** Every non-test source file whose count exceeds its allowance (0 unless listed as debt). */
const overAllowance = (pattern: RegExp, debt: Record<string, number>, files: Record<string, string> = sources) =>
  Object.entries(files)
    .filter(([path]) => !isTest(path))
    .map(([path, text]) => ({ path, count: countIn(text, pattern), allowed: debt[path] ?? 0 }))
    .filter(({ count, allowed }) => count > allowed);

// Files whose buttons/labels this stage moved onto the primitives.
const MIGRATED = [
  '/src/App.tsx',
  '/src/components/Navbar.tsx',
  '/src/components/WeatherPanel.tsx',
  '/src/components/LoginScreen.tsx',
  '/src/components/ChatInterface.tsx',
  '/src/components/ChatSidebar.tsx',
  // design-system cleanup pass
  '/src/components/ManageParcels.tsx',
  '/src/components/FarmProfileEditor.tsx',
  '/src/components/ProfileOnboarding.tsx',
  '/src/components/MessageBubble.tsx',
];

describe('static design-system guards', () => {
  it('UI-14: every shared UI primitive exists and is exported from the barrel', () => {
    for (const file of UI_PRIMITIVES) {
      expect(sources[`/src/components/ui/${file}`], file).toBeTypeOf('string');
    }
    const barrel = source('/src/components/ui/index.ts');
    for (const name of ['cn', 'toneClasses', 'Button', 'Card', 'Badge', 'StatusPill', 'Alert', 'Stepper', 'EmptyState', 'Skeleton', 'ConfirmDialog']) {
      expect(barrel, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('UI-14: no emoji used as an icon in the weather strip or the chat surfaces', () => {
    for (const path of ['/src/components/WeatherPanel.tsx', '/src/components/ChatSidebar.tsx', '/src/components/ChatInterface.tsx']) {
      expect(stripComments(source(path)), path).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('UI-14: no source file outside the listed debt has the copy-pasted button gradient; restyled files use the 2xs token', () => {
    expect(overAllowance(GRADIENT, GRADIENT_DEBT)).toEqual([]);
    for (const path of MIGRATED) {
      expect(GRADIENT_DEBT[path], path).toBeUndefined();
      expect(countIn(source(path), GRADIENT), path).toBe(0);
    }
    // Fully restyled files are held to the type-size rule. The chat surfaces joined this list when
    // they moved onto the tokens and text-2xs (their only 10/11 px usages are gone).
    for (const path of ['/src/App.tsx', '/src/components/Navbar.tsx', '/src/components/WeatherPanel.tsx', '/src/components/LoginScreen.tsx', '/src/components/ChatSidebar.tsx', '/src/components/ChatInterface.tsx']) {
      expect(source(path), path).not.toMatch(/text-\[1[01]px\]/);
    }
  });

  it('UI-14: icon-only labels are sr-only (never display:none) in the nav and map controls', () => {
    for (const path of ['/src/components/Navbar.tsx', '/src/components/ParcelDrawMap.tsx', '/src/components/ManageParcels.tsx']) {
      // The language switch keeps `hidden sm:inline` for a VISUAL long label only; its button is
      // named by aria-label, so only nav/map labels are checked here.
      const text = source(path).replace(/<span aria-hidden="true" className="hidden sm:inline">\{lang\.label\}<\/span>/, '');
      expect(text, path).not.toMatch(/className="hidden sm:inline"/);
    }
  });

  it('UI-14: accessible names in the cleanup-pass files come from i18n, never a hard-coded English literal', () => {
    // e.g. MessageBubble's backdrop used aria-label="Close menu", which Tamil users heard in English.
    const LITERAL_NAME = /\b(?:aria-label|title|alt)="[^"{]*[A-Za-z][^"]*"/;
    for (const path of ['/src/components/MessageBubble.tsx', '/src/components/ManageParcels.tsx', '/src/components/FarmProfileEditor.tsx', '/src/components/ProfileOnboarding.tsx']) {
      expect(stripComments(source(path)), path).not.toMatch(LITERAL_NAME);
    }
    expect('<button aria-label="Close menu" />').toMatch(LITERAL_NAME);
    expect("<button aria-label={t('closeMenu')} />").not.toMatch(LITERAL_NAME);
  });

  it('UI-14: nothing reads the misspelled user storage key, and no source file outside the listed debt calls window.confirm', () => {
    for (const [path, text] of Object.entries(sources)) {
      if (isTest(path)) continue;
      expect(text, path).not.toContain("'vivasayi:user'");
    }
    expect(overAllowance(CONFIRM_CALL, WINDOW_CONFIRM_DEBT)).toEqual([]);
    for (const path of MIGRATED) {
      expect(WINDOW_CONFIRM_DEBT[path], path).toBeUndefined();
    }
  });

  it('UI-14: the debt guards really detect the patterns (so a green run is not vacuous)', () => {
    expect(countIn('if (!window.confirm(t("x"))) return;', CONFIRM_CALL)).toBe(1);
    expect(countIn('if (confirm("x")) go(); globalThis.confirm("y");', CONFIRM_CALL)).toBe(2);
    expect(countIn('onConfirm(); handleConfirm(); dialog.confirm();', CONFIRM_CALL)).toBe(0);
    expect(countIn('// Replaces window.confirm (blocking)\n/* window.confirm( */', CONFIRM_CALL)).toBe(0);
    expect(countIn("const u = 'https://x'; confirm(u);", CONFIRM_CALL)).toBe(1);
    expect(countIn('className="bg-gradient-to-r from-emerald-600 to-green-700"', GRADIENT)).toBe(1);

    // Any file, listed or not, is reported once it exceeds its allowance; tests are skipped.
    const files = {
      '/src/components/New.tsx': 'if (!window.confirm(m)) return;',
      '/src/components/Listed.tsx': 'window.confirm(a); window.confirm(b);',
      '/src/components/Listed.test.tsx': 'window.confirm(a);',
    };
    expect(overAllowance(CONFIRM_CALL, { '/src/components/Listed.tsx': 2 }, files)).toEqual([
      { path: '/src/components/New.tsx', count: 1, allowed: 0 },
    ]);
    expect(overAllowance(CONFIRM_CALL, { '/src/components/Listed.tsx': 1 }, files)).toHaveLength(2);
  });

  it('UI-14 / TRK: the claim flow files carry no gradient, no window.confirm and no 10/11 px type', () => {
    for (const path of CLAIM_FLOW_FILES) {
      const text = source(path);
      expect(GRADIENT_DEBT[path], path).toBeUndefined();
      expect(WINDOW_CONFIRM_DEBT[path], path).toBeUndefined();
      expect(countIn(text, GRADIENT), path).toBe(0);
      expect(countIn(text, CONFIRM_CALL), path).toBe(0);
      expect(stripComments(text), path).not.toMatch(/text-\[1[01]px\]/);
    }
  });

  it('TRK: no farmer claim screen calls the verify endpoint or the old poller, shows a progress bar or a percentage', () => {
    const farmerFiles = Object.keys(sources).filter(
      (path) => !isTest(path) && (path.startsWith('/src/components/claims/') || /^\/src\/components\/Claim[A-Za-z]*\.tsx$/.test(path))
    );
    expect(farmerFiles).toEqual(expect.arrayContaining(['/src/components/ClaimsPage.tsx', '/src/components/claims/ClaimTracker.tsx']));
    for (const path of farmerFiles) {
      const code = stripComments(source(path));
      expect(code, path).not.toMatch(/verifyClaimRequest|pollVerificationUntilSettled/);
      expect(code, path).not.toMatch(/role=["']progressbar["']|<progress\b|aria-valuenow/);
    }
  });

  it('UI-14: the header and landing page never read the device place name', () => {
    for (const path of ['/src/components/Navbar.tsx', '/src/components/LoginScreen.tsx']) {
      const text = source(path);
      expect(text, path).not.toMatch(/useLocation\(|displayName|outsideTamilNadu/);
    }
  });
});
