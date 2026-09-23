import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { ChatInterface } from './components/ChatInterface';
import { ProfileOnboarding } from './components/ProfileOnboarding';
import ChatSidebar from './components/ChatSidebar';
import { Navbar, type AppSection } from './components/Navbar';
import { WeatherPanel } from './components/WeatherPanel';
import { ClaimsPage } from './components/ClaimsPage';
import { LocationProvider } from './context/LocationContext';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import { getProfile, deleteChatSession } from './api';
import { ApiClientError, friendlyMessageKey } from './api/client';
import type { FarmProfile } from './types';

type ProfileStatus = 'loading' | 'loaded' | 'missing' | 'error';

function App() {
  const { user, language, isLoading, setLanguage } = useAuth();
  const { t, i18n } = useTranslation();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [section, setSection] = useState<AppSection>('chat');

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

  // Whole-chat deletion for the message-menu dialog (the only delete the backend supports).
  const handleDeleteActiveChat = useCallback(async () => {
    if (!activeChatId) return;
    try {
      await deleteChatSession(activeChatId);
      setActiveChatId(null);
      setRefreshChats((prev) => !prev);
      toast.success(t('chatDeleted'), { duration: 3000 });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) return; // auth layer routes to login
        if (err.status === 404) {
          // Already gone — return the UI to a safe state without error noise.
          setActiveChatId(null);
          return;
        }
        toast.error(t(friendlyMessageKey(err.status)), { duration: 4000 });
        return;
      }
      toast.error(t('deleteFailed'), { duration: 4000 });
    }
  }, [activeChatId, t]);

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

  if (!user) {
    // Public landing page (premium two-panel). LocationProvider is shared with the
    // authenticated shell so a location resolved pre-login (or in a previous session) is
    // never re-prompted; `autoRequest={false}` means the landing page never auto-prompts for
    // permission — the user taps "Use my location", then after login location simply carries
    // forward and the weather/insight flow picks up from there.
    return (
      <LocationProvider autoRequest={false}>
        <LoginScreen />
      </LocationProvider>
    );
  }

  const openProfile = () => setProfileSkipped(false);

  return (
    <LocationProvider autoRequest>
      <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
        {/* NAVBAR — always fully visible (in-flow, first child, everything below is min-h-0) */}
        <Navbar
          hasProfile={profileStatus === 'loaded'}
          onOpenProfile={openProfile}
          section={section}
          onSelectSection={setSection}
        />

        {/* LOCATION + WEATHER DASHBOARD (location-first, independent of profile) */}
        <WeatherPanel profile={profile} />

        {/* WORKSPACE: sidebar drawer + chat (or the claims section) */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {section === 'claims' ? (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ClaimsPage />
            </main>
          ) : (
            <>
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
                  onDeleteChat={handleDeleteActiveChat}
                />
              </main>
            </>
          )}
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