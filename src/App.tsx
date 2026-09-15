import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { ChatInterface } from './components/ChatInterface';
import { ProfileOnboarding } from './components/ProfileOnboarding';
import ChatSidebar from './components/ChatSidebar';
import { Navbar } from './components/Navbar';
import { WeatherPanel } from './components/WeatherPanel';
import { LocationProvider } from './context/LocationContext';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { getProfile } from './api';
import { ApiClientError } from './api/client';
import type { FarmProfile } from './types';

type ProfileStatus = 'loading' | 'loaded' | 'missing' | 'error';

function App() {
  const { user, language, isLoading, setLanguage } = useAuth();
  const { t, i18n } = useTranslation();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Farm profile is needed for personalized advice, but it is NOT a gate for the location
  // experience: location + weather work independently. If missing, a dismissible onboarding
  // overlay is offered and can be reopened from the navbar user menu.
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [profileSkipped, setProfileSkipped] = useState(false);
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
        // Backend contract: GET /profile returns 404 when no profile exists.
        setProfileStatus('missing');
        return;
      }
      // Network/server failure must NOT masquerade as "no profile".
      setProfileStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      const profileKey = user.email ?? user._id ?? 'anonymous';
      if (profileLoadedForRef.current === profileKey) return;
      profileLoadedForRef.current = profileKey;
      void loadProfile();
    } else {
      profileLoadedForRef.current = null;
      setProfileStatus('loading');
      setProfile(null);
    }
  }, [user, loadProfile]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-14 w-14 animate-spin text-emerald-600" />
          <p className="text-lg text-gray-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  const openProfile = () => setProfileSkipped(false);

  return (
    <LocationProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
        {/* NAVBAR — always fully visible (in-flow, first child, everything below is min-h-0) */}
        <Navbar hasProfile={profileStatus === 'loaded'} onOpenProfile={openProfile} />

        {/* LOCATION + WEATHER DASHBOARD (location-first, independent of profile) */}
        <WeatherPanel profile={profile} />

        {/* WORKSPACE: sidebar drawer + chat */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ChatSidebar
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
            refreshChats={refreshChats}
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatInterface
              activeChatId={activeChatId}
              setActiveChatId={setActiveChatId}
              onMessageSent={(createdNew) => {
                if (createdNew) setRefreshChats((prev) => !prev);
              }}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
          </main>
        </div>

        {/* PROFILE ERROR / RETRY (non-fatal; the shell stays fully usable) */}
        {profileStatus === 'error' && (
          <div className="flex items-center justify-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <span>{t('profileLoadFailed')}</span>
            <button
              onClick={() => void loadProfile()}
              className="rounded-full border border-amber-400 px-3 py-0.5 font-semibold hover:bg-amber-100"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {/* ONBOARDING — optional, non-blocking, location-independent */}
        {profileStatus === 'missing' && !profileSkipped && (
          <ProfileOnboarding
            onComplete={(savedProfile) => {
              setProfile(savedProfile);
              setProfileStatus('loaded');
            }}
            onSkip={() => setProfileSkipped(true)}
          />
        )}

        {/* TOASTER */}
        <Toaster
          position="top-right"
          duration={3000}
          richColors
          closeButton
          expand={false}
          visibleToasts={3}
        />
      </div>
    </LocationProvider>
  );
}

export default App;