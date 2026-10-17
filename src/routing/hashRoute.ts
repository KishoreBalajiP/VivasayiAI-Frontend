// Hash routes (plan B2) — pure parse/format, no dependency and no DOM access, so the whole route
// table is unit-testable in node.
//
//   ''  '#'  '#/'  '#/chat'   → chat (the default section)
//   '#/claims'                → claims list
//   '#/claims/new'            → claim wizard
//   '#/claims/:id'            → claim tracker (id sanitised; the backend still checks ownership)
//   '#/admin'                 → admin review (render-gated by isAdmin in App)
//   anything else             → chat, flagged `unknown` so App can replace it with '#/chat'
//
// The hash (not the path) is used because the app is served as a static SPA: a path route would
// need server rewrites, and Cognito's redirect URI is the bare origin. Wizard steps are
// deliberately NOT in the URL; the wizard restores its own draft.

export type AppSection = 'chat' | 'claims' | 'admin';

export type AppRoute =
  | { section: 'chat' }
  | { section: 'claims'; view: 'list' }
  | { section: 'claims'; view: 'new' }
  | { section: 'claims'; view: 'detail'; claimId: string }
  | { section: 'admin' };

export type ParsedRoute = AppRoute & { unknown?: true };

export const DEFAULT_ROUTE: AppRoute = { section: 'chat' };

// Mongo ObjectIds today; the wider pattern also covers test ids such as `c_1`. Anything else
// (slashes, dots, script fragments, over-long values) never reaches an API path.
export const CLAIM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidClaimId = (value: string): boolean => CLAIM_ID_PATTERN.test(value);

const UNKNOWN: ParsedRoute = { section: 'chat', unknown: true };

const decodeSegment = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

export const parseHash = (hash: string | null | undefined): ParsedRoute => {
  // Drop the leading '#', any query part, and leading/trailing slashes.
  const raw = (hash ?? '').replace(/^#/, '').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (raw === '') return { section: 'chat' };

  const segments = raw.split('/');
  const head = segments[0].toLowerCase();

  if (head === 'chat') return segments.length === 1 ? { section: 'chat' } : UNKNOWN;
  if (head === 'admin') return segments.length === 1 ? { section: 'admin' } : UNKNOWN;

  if (head === 'claims') {
    if (segments.length === 1) return { section: 'claims', view: 'list' };
    if (segments.length !== 2) return UNKNOWN;
    const second = decodeSegment(segments[1]);
    if (second === null) return UNKNOWN;
    if (second.toLowerCase() === 'new') return { section: 'claims', view: 'new' };
    return isValidClaimId(second) ? { section: 'claims', view: 'detail', claimId: second } : UNKNOWN;
  }

  return UNKNOWN;
};

export const formatRoute = (route: AppRoute): string => {
  switch (route.section) {
    case 'chat':
      return '#/chat';
    case 'admin':
      return '#/admin';
    case 'claims':
      if (route.view === 'new') return '#/claims/new';
      if (route.view === 'detail') {
        // Never format an id that parseHash would refuse; fall back to the list instead.
        return isValidClaimId(route.claimId) ? `#/claims/${route.claimId}` : '#/claims';
      }
      return '#/claims';
  }
};

/** The top-level section for a route (what the Navbar highlights and App renders). */
export const sectionOf = (route: AppRoute): AppSection => route.section;

/** Route that a Navbar section button navigates to. */
export const routeForSection = (section: AppSection): AppRoute =>
  section === 'claims' ? { section: 'claims', view: 'list' } : { section };

export const isSameRoute = (a: AppRoute, b: AppRoute): boolean => formatRoute(a) === formatRoute(b);

// ── returnTo (survives the Cognito login round-trip, which drops the hash) ───────────────────
export const RETURN_TO_KEY = 'vivasayi.nav:returnTo';

/**
 * Accept only an in-app hash route that parses to a known route, normalised to its canonical
 * form. Full URLs, other origins, and unknown routes are rejected (open-redirect hygiene).
 */
export const sanitizeReturnTo = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string' || !value.startsWith('#/')) return null;
  const parsed = parseHash(value);
  if (parsed.unknown) return null;
  return formatRoute(parsed);
};
