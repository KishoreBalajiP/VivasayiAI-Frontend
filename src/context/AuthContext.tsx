import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Language } from '../types';
import { config } from '../config';

interface AuthContextType {
  user: User | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
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

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedLang = localStorage.getItem('language') as Language;
    const token = localStorage.getItem('id_token');

    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    
    // ✅ FIX: Properly validate and set language from localStorage
    if (storedLang && (storedLang === 'en' || storedLang === 'ta')) {
      setLanguageState(storedLang);
    } else {
      // Default to English if no valid language is stored
      setLanguageState('en');
      localStorage.setItem('language', 'en');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      handleCallback(code);
    } else {
      setIsLoading(false);
    }
  }, []);

  // ✅ FIX: Sync i18n with language changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Import i18n and change language when language state changes
      import('../i18n').then(({ default: i18n }) => {
        if (i18n.language !== language) {
          i18n.changeLanguage(language);
        }
      });
    }
  }, [language]);

  const handleCallback = async (code: string) => {
    try {
      // Exchange authorization code for tokens directly with Cognito
      const body = new URLSearchParams();
      body.append('grant_type', 'authorization_code');
      body.append('client_id', config.cognito.clientId);
      body.append('code', code);
      body.append('redirect_uri', config.cognito.redirectUri);

      const response = await fetch(`https://${config.cognito.domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const data = await response.json();

      if (data.id_token) {
        // Decode JWT to get user info (basic)
        const payload = JSON.parse(atob(data.id_token.split('.')[1]));
        const user: User = {
          name: payload.name || payload.email,
          email: payload.email
        };

        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('id_token', data.id_token);
        setUser(user);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    const authUrl = `https://${config.cognito.domain}/oauth2/authorize?` +
      `client_id=${config.cognito.clientId}&` +
      `response_type=code&` +
      `scope=openid+email+profile&` +
      `redirect_uri=${encodeURIComponent(config.cognito.redirectUri)}`;

    window.location.href = authUrl;
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('id_token');
    // ✅ FIX: Don't remove language on logout - keep user preference
    // localStorage.removeItem('language');
    setUser(null);
    // ✅ FIX: Don't reset language to English on logout
    // setLanguageState('en');
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    
    // ✅ FIX: Also update i18n immediately
    import('../i18n').then(({ default: i18n }) => {
      i18n.changeLanguage(lang);
    });
  };

  const updateUserLanguage = async (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <AuthContext.Provider value={{
      user,
      language,
      setLanguage,
      login,
      logout,
      isLoading,
      updateUserLanguage
    }}>
      {children}
    </AuthContext.Provider>
  );
};