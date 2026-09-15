import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { ChatInterface } from './components/ChatInterface';
import { ProfileOnboarding } from './components/ProfileOnboarding';
import ChatSidebar from './components/ChatSidebar';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { getProfile } from './api';
import { ApiClientError } from './api/client';
import { WeatherPanel } from './components/WeatherPanel';
import type { FarmProfile } from './types';

type ProfileStatus = 'loading' | 'loaded' | 'missing' | 'error';

function App() {
  const { user, language, isLoading, setLanguage } = useAuth();
  const { t, i18n } = useTranslation();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false);

  // ✅ SHARED SIDEBAR STATE (THIS WAS MISSING)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Farm profile gate: the authenticated user's profile decides between onboarding and the
  // chat application. It is never a manual part of chat requests — the backend loads it.
  // The loaded profile is the source for the weather district (WeatherPanel).
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profile, setProfile] = useState<FarmProfile | null>(null);

  // Which logged-in user's profile has already been requested. Prevents the profile fetch
  // from being repeated during same-user remounts (incl. dev StrictMode double-effects).
  const profileLoadedForRef = useRef<string | null>(null);

  // Sync i18n with auth language
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const loadProfile = useCallback(async () => {
    setProfileStatus('loading');
    try {
      const fetched = await getProfile();
      setProfile(fetched);
      // A saved profile owns the preferred language — initialize the app from it.
      if (fetched.language) {
        setLanguage(fetched.language);
      }
      setProfileStatus('loaded');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return; // auth layer handles
      if (err instanceof ApiClientError && err.status === 404) {
        // Verified backend contract: GET /profile returns 404 when no profile exists.
        setProfileStatus('missing');
        return;
      }
      // Network/server failure must NOT masquerade as "no profile" — show retry instead.
      setProfileStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      const profileKey = user.email ?? user._id ?? 'anonymous';
      if (profileLoadedForRef.current === profileKey) return; // already fetched for this user
      profileLoadedForRef.current = profileKey;
      void loadProfile();
    } else {
      // Signed out — reset profile gate so the next login refetches exactly once.
      profileLoadedForRef.current = null;
      setProfileStatus('loading');
      setProfile(null);
    }
  }, [user, loadProfile]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-xl text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (profileStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-xl text-gray-600">{t('profileLoading')}</p>
        </div>
      </div>
    );
  }

  if (profileStatus === 'missing') {
    return (
      <ProfileOnboarding
        onComplete={(savedProfile) => {
          // Adopt the freshly saved profile so the weather bar/chat gate resolve immediately
          // instead of waiting for the follow-up GET round-trip.
          setProfile(savedProfile);
          setProfileStatus('loaded');
        }}
      />
    );
  }

  if (profileStatus === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <p className="text-lg text-gray-700 mb-4">{t('profileLoadFailed')}</p>
          <button
            onClick={() => void loadProfile()}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* AUTHENTICATED WEATHER BAR — driven solely by the loaded FarmProfile district */}
        <WeatherPanel district={profile?.district} />

        <div className="flex flex-1 overflow-hidden">

          {/* SIDEBAR */}
          <ChatSidebar
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
            refreshChats={refreshChats}
            isOpen={isSidebarOpen}          // ✅ CONNECTED
            setIsOpen={setIsSidebarOpen}    // ✅ CONNECTED
          />

          {/* CHAT WINDOW */}
          <div className="flex-1">
            <ChatInterface
              activeChatId={activeChatId}
              setActiveChatId={setActiveChatId}
              onMessageSent={(createdNew) => {
                // Refresh the list only when a brand-new session was created (its title is
                // auto-derived server-side). Sends inside existing sessions don't refetch.
                if (createdNew) setRefreshChats(prev => !prev);
              }}
              onOpenSidebar={() => setIsSidebarOpen(true)} // ✅ HAMBURGER WORKS
            />
          </div>
        </div>
      </div>

      {/* TOASTER */}
      <Toaster
        position="top-right"
        duration={3000}
        richColors
        closeButton
        expand={false}
        visibleToasts={3}
      />
    </>
  );
}

export default App;