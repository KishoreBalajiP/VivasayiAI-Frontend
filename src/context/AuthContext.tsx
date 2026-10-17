import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { BackendAuthResponse, BackendUser, Language } from '../types';
import { config } from '../config';
import {
  ApiClientError,
  clearAuthState,
  getAccessToken,
  loginErrorKey,
  registerUnauthorizedHandler,
  request,
  setAccessToken,
} from '../api/client';
import i18n from '../i18n';
import { consumeReturnTo, notifyRouteChange, saveReturnTo } from '../routing/useHashRoute';
import { isBackendTokenExpired } from '../utils/jwt';

// Exported so other readers of the stored user (AdminReviewPage's actor sub) cannot drift to a
// different spelling of the key again.
export const USER_STORAGE_KEY = `${config.auth.storageKeyPrefix}:user`;
const USER_KEY = USER_STORAGE_KEY;
const OAUTH_STATE_KEY = `${config.auth.storageKeyPrefix}:oauthState`;

// Claim-wizard drafts are stored per user under this prefix (claimDraftStorage). They are removed
// on an explicit logout so the next person on a shared phone never sees them. A 401/expiry does
// NOT clear them: the same farmer signs back in and continues the draft.
const CLAIM_DRAFT_KEY_PREFIX = 'vivasayi.claimDraft.';
// The claim tracker's last-known progress per claim (utils/progressPolling.ts, 1 h snapshot). Also
// farmer data, so it goes on logout too.
const CLAIM_PROGRESS_KEY_PREFIX = 'vivasayi.claimProgress.';

const clearClaimDrafts = (): void => {
  // Accessors, not values: merely touching `sessionStorage` can throw when storage is blocked.
  for (const getStorage of [() => sessionStorage, () => localStorage]) {
    try {
      const storage = getStorage();
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && (key.startsWith(CLAIM_DRAFT_KEY_PREFIX) || key.startsWith(CLAIM_PROGRESS_KEY_PREFIX))) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // storage unavailable — nothing persisted there to clear
    }
  }
};

// Fallback for browsers/environments where sessionStorage is blocked (e.g. privacy modes):
// the OAuth state still survives within the SPA lifetime so login keeps working.
let inMemoryOAuthState: string | null = null;

interface AuthContextType {
  user: BackendUser | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  login: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  // Phase 10 (E9-S10): read-only gate for the admin review UI. The role arrives signed in the
  // user object the backend returned from POST /auth/google (services/auth.service.js sets
  // user.role from Cognito): the UI NEVER guesses an admin from email or claims.
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const generateOAuthState = (): string => {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};


const readStored = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable — state stays in memory for this page only
  }
};

const removeStored = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Guards the OAuth callback against the dev-mode StrictMode double effect (and any future
  // remount): the second run must not treat the in-flight callback as "handled, then failed".
  const oauthHandledRef = useRef(false);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    removeStored(USER_KEY);
    setUser(null);
    setAuthError(null);
  }, []);

  // OAuth callback: the backend owns the Cognito client and performs the token exchange
  // (POST /auth/google). The browser must NEVER talk to Cognito's token endpoint directly.
  const handleOAuthCallback = async (code: string, state: string | null) => {
    setAuthError(null);
    setIsAuthenticating(true);

    const expectedState = readStored(OAUTH_STATE_KEY) ?? inMemoryOAuthState;
    inMemoryOAuthState = null;
    removeStored(OAUTH_STATE_KEY);

    try {
      if (!code || !expectedState || !state || state !== expectedState) {
        removeStored(USER_KEY);
        setAccessToken(null);
        setUser(null);
        setAuthError('authInvalidCallback');
        return;
      }

      clearAuthState();

      const envelope = await request<BackendAuthResponse>('/auth/google', {
        method: 'POST',
        body: { code },
      });

      const result = envelope.data;
      if (!result?.accessToken || !result?.user?.email) {
        removeStored(USER_KEY);
        setAccessToken(null);
        setAuthError('loginFailed');
        return;
      }

      setAccessToken(result.accessToken);
      writeStored(USER_KEY, JSON.stringify(result.user));
      setUser(result.user);
    } catch (err) {
      // Full reset: the token and any stored user from a previous session must not survive
      // a failed exchange, otherwise the app would look logged-in against a dead token.
      removeStored(USER_KEY);
      clearAuthState();
      setAccessToken(null);
      setUser(null);
      // Distinct, farmer-safe messages per backend status (403 unverified email, 409 account
      // linked elsewhere, 502 sign-in service down); anything else stays the generic message.
      setAuthError(loginErrorKey(err instanceof ApiClientError ? err.status : -1));
    } finally {
      // Remove the temporary OAuth params from the URL (never leave the code/state visible) and
      // restore the in-app route saved before the Cognito redirect (which drops the hash).
      // replaceState fires no hashchange, so the router is notified explicitly.
      const returnTo = consumeReturnTo();
      window.history.replaceState({}, document.title, window.location.pathname + (returnTo ?? ''));
      notifyRouteChange();
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Any API-layer 401 clears the invalid session and routes back to login (no refresh
    // endpoint exists yet, so no auto-recovery loop is attempted).
    registerUnauthorizedHandler(() => {
      clearSession();
      setAuthError('authExpired');
    });

    // Clean up legacy auth remnants from the previous direct-Cognito flow.
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('id_token');
    } catch {
      // ignore
    }

    let storedLanguage: string | null = null;
    try {
      storedLanguage = localStorage.getItem('language');
    } catch {
      // default to English below
    }
    if (storedLanguage === 'en' || storedLanguage === 'ta') {
      setLanguageState(storedLanguage);
    } else {
      try {
        localStorage.setItem('language', 'en');
      } catch {
        // ignore
      }
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      // Dev StrictMode double-mounts this effect; without the guard the second run would
      // clear the SPA's oauth state and race the in-flight callback with an empty `state`.
      if (oauthHandledRef.current) return;
      oauthHandledRef.current = true;
      void handleOAuthCallback(code, params.get('state'));
      return;
    }

    const token = getAccessToken();
    const storedUser = readStored(USER_KEY);
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as BackendUser;
        if (!isBackendTokenExpired(token) && parsedUser && parsedUser.email) {
          setUser(parsedUser);
        } else {
          clearSession();
        }
      } catch {
        clearSession();
      }
    } else {
      clearSession();
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async () => {
    setAuthError(null);

    if (!config.cognito.domain || !config.cognito.clientId || !config.cognito.redirectUri) {
      setAuthError('authMisconfigured');
      return;
    }

    // `state` guards the callback against login CSRF. PKCE is intentionally NOT added here:
    // the backend's Cognito token exchange (services/auth.service.js) does not forward a
    // code_verifier, so a PKCE authorize request would be rejected at the token endpoint
    // until the backend adds verifier support (see Phase 1 report — follow-up item).
    const state = generateOAuthState();
    writeStored(OAUTH_STATE_KEY, state);
    inMemoryOAuthState = state;
    // Remember where the farmer was (e.g. #/claims/<id>) so the callback can return there.
    saveReturnTo();

    const params = new URLSearchParams({
      client_id: config.cognito.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: config.cognito.redirectUri,
      state,
    });

    window.location.assign(
      `https://${config.cognito.domain}/oauth2/authorize?${params.toString()}`
    );
  }, []);

  const logout = useCallback(() => {
    clearClaimDrafts();
    clearSession();
  }, [clearSession]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('language', lang);
    } catch {
      // ignore
    }
    i18n.changeLanguage(lang);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        language,
        setLanguage,
        login,
        logout,
        isLoading,
        isAuthenticating,
        authError,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};