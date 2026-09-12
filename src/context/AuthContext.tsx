import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { BackendAuthResponse, BackendUser, Language } from '../types';
import { config } from '../config';
import {
  clearAuthState,
  getAccessToken,
  registerUnauthorizedHandler,
  request,
  setAccessToken,
} from '../api/client';
import i18n from '../i18n';

const USER_KEY = `${config.auth.storageKeyPrefix}:user`;
const OAUTH_STATE_KEY = `${config.auth.storageKeyPrefix}:oauthState`;

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
  updateUserLanguage: (lang: Language) => Promise<void>;
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

// The backend access token is a short-lived JWT. We cannot verify its signature in the
// browser, but we can read `exp` to skip a doomed API call after expiry (a 401 then takes
// over as the authoritative path back to login).
const isBackendTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
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
        setAccessToken(null);
        setAuthError('loginFailed');
        return;
      }

      setAccessToken(result.accessToken);
      writeStored(USER_KEY, JSON.stringify(result.user));
      setUser(result.user);
    } catch {
      setAccessToken(null);
      setUser(null);
      setAuthError('loginFailed');
    } finally {
      // Remove the temporary OAuth params from the URL (never leave the code/state visible).
      window.history.replaceState({}, document.title, window.location.pathname);
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Any API-layer 401 clears the invalid session and routes back to login (no refresh
    // endpoint exists yet, so no auto-recovery loop is attempted).
    registerUnauthorizedHandler(() => {
      setAccessToken(null);
      removeStored(USER_KEY);
      setUser(null);
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

  const updateUserLanguage = useCallback(
    async (lang: Language) => {
      setLanguage(lang);
    },
    [setLanguage]
  );

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
        updateUserLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};