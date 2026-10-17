import { useMemo, useSyncExternalStore } from 'react';
import {
  RETURN_TO_KEY,
  formatRoute,
  parseHash,
  sanitizeReturnTo,
  type AppRoute,
  type ParsedRoute,
} from './hashRoute';

// The URL hash is the external store. Browser Back/Forward fire `hashchange`/`popstate`;
// history.replaceState fires nothing, so navigate({replace}) and AuthContext notify through the
// internal emitter. useSyncExternalStore keeps every subscriber on the same snapshot (no tearing).

const listeners = new Set<() => void>();

/** Tell subscribers the hash changed without an event (after history.replaceState). */
export const notifyRouteChange = (): void => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
};

const getSnapshot = (): string => window.location.hash;
const getServerSnapshot = (): string => '';

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing (e.g. wizard → tracker, unknown → chat). */
  replace?: boolean;
}

/**
 * Go to a route. Push adds a history entry (Back returns here); replace rewrites the current one.
 * Navigating to the route already shown is a no-op, so double clicks never stack duplicates.
 */
export const navigate = (route: AppRoute, options: NavigateOptions = {}): void => {
  const target = formatRoute(route);
  if (window.location.hash === target) return;
  if (options.replace) {
    window.history.replaceState(window.history.state, '', target);
  } else {
    window.location.hash = target;
  }
  // `hashchange` is asynchronous (and absent for replaceState): update subscribers now.
  notifyRouteChange();
};

export const useHashRoute = (): { route: ParsedRoute; navigate: typeof navigate } => {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const route = useMemo(() => parseHash(hash), [hash]);
  return { route, navigate };
};

// ── returnTo: the Cognito redirect comes back to the bare origin, so the hash is saved before
// login and restored after the OAuth callback (AuthContext). Only sanitised '#/' routes pass. ──

export const saveReturnTo = (hash: string = window.location.hash): void => {
  const value = sanitizeReturnTo(hash);
  try {
    if (value) sessionStorage.setItem(RETURN_TO_KEY, value);
    else sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // storage unavailable — the user simply lands on the default section after login
  }
};

/** Read and clear the saved route. Returns null when absent or not a safe in-app route. */
export const consumeReturnTo = (): string | null => {
  try {
    const value = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return sanitizeReturnTo(value);
  } catch {
    return null;
  }
};
