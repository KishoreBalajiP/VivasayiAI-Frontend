import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { ChatInterface } from './components/ChatInterface';
import { ProfileOnboarding } from './components/ProfileOnboarding';
import { FarmProfileEditor } from './components/FarmProfileEditor';
import { ManageParcels } from './components/ManageParcels';
import ChatSidebar from './components/ChatSidebar';
import { Navbar } from './components/Navbar';
import { WeatherPanel } from './components/WeatherPanel';
import { ClaimsPage } from './components/ClaimsPage';
import { AdminReviewPage } from './components/AdminReviewPage';
import { LocationProvider } from './context/LocationContext';
import { Button } from './components/ui';
import { DEFAULT_ROUTE, routeForSection, type AppSection } from './routing/hashRoute';
import { useHashRoute } from './routing/useHashRoute';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import { getProfile, deleteChatSession } from './api';
import { ApiClientError, friendlyMessageKey } from './api/client';
import type { FarmProfile } from './types';

type ProfileStatus = 'loading' | 'loaded' | 'missing' | 'error';

function App() {
  const { user, language, isLoading, setLanguage, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // The section comes from the URL hash (#/chat, #/claims…, #/admin), so browser Back/Forward
  // switch sections. The full route (view, claimId) is available to any component through
  // useHashRoute(); ClaimsPage derives its list / wizard / claim-tracker view from it, so
  // #/claims/<id> opens that claim's tracker on load, on reload and from a shared link.
  const { route, navigate } = useHashRoute();
  const section: AppSection = route.section;
  const selectSection = useCallback(
    (next: AppSection) => navigate(routeForSection(next)),
    [navigate]
  );

  // An unknown hash renders chat and is rewritten in place (no extra history entry).
  useEffect(() => {
    if (route.unknown) navigate(DEFAULT_ROUTE, { replace: true });
  }, [route, navigate]);

  // Farm profile is needed for personalized advice, but it is NOT a gate for the location
  // experience: location + weather work independently. If missing, a dismissible onboarding
  // overlay is offered and can be reopened from the navbar user menu.
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [profileSkipped, setProfileSkipped] = useState(false);
  const profileLoadedForRef = useRef<string | null>(null);

  // Farm Profile Editor modal state
  const [showFarmProfileEditor, setShowFarmProfileEditor] = useState(false);
  const [farmProfileEditorProfile, setFarmProfileEditorProfile] = useState<FarmProfile | null>(null);

  // Manage Parcels modal state
  const [showManageParcels, setShowManageParcels] = useState(false);

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
        // Backend contract: GET /profile returns 404 when no profile exists. Drop any profile
        // from an earlier load so its district is not shown as still known.
        setProfile(null);
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

  const openFarmProfileEditor = useCallback(() => {
    setFarmProfileEditorProfile(profile);
    setShowFarmProfileEditor(true);
  }, [profile]);

  const openManageParcels = useCallback(() => {
    setShowManageParcels(true);
  }, []);

  const handleFarmProfileEditorComplete = useCallback((savedProfile: FarmProfile) => {
    setProfile(savedProfile);
    setProfileStatus('loaded');
    setShowFarmProfileEditor(false);
  }, []);

  const handleManageParcelsClose = useCallback(() => {
    setShowManageParcels(false);
    // Reload profile to get updated parcel count
    void loadProfile();
  }, [loadProfile]);

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
    // Public landing page (premium two-panel). It is farm-first like the shell: it explains that
    // weather and advice follow the farm district and never shows a device place name or an
    // "Outside Tamil Nadu" verdict. The provider stays so a session location carries over, but
    // `autoRequest={false}` means nothing ever prompts for permission here.
    return (
      <LocationProvider autoRequest={false}>
        <LoginScreen />
      </LocationProvider>
    );
  }

  // What the shell knows about the farm. A reload (e.g. after Manage Parcels closes) sets the
  // status back to 'loading', and a failed reload to 'error', but the profile already in state
  // is kept: a district the app knows must not be hidden or turned into "Set farm district" while
  // a reload is in flight or after it failed. Only with no district at all does loading/error
  // mean "unknown". (A 404 clears the profile in loadProfile, so a stale one never lingers.)
  const farmDistrict = profile?.district?.trim() || null;
  const profileUnknown = !farmDistrict && (profileStatus === 'loading' || profileStatus === 'error');
  const hasProfile = profileStatus === 'loaded' || (profile !== null && profileStatus !== 'missing');

  // Farm-first: the header and the default weather use the PROFILE farm district. The device
  // location is never requested automatically (autoRequest={false}); the farmer opts in from the
  // weather strip or the parcel map's "My location" control.
  return (
    <LocationProvider autoRequest={false}>
      <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
        {/* NAVBAR — always fully visible (in-flow, first child, everything below is min-h-0) */}
        <Navbar
          hasProfile={hasProfile}
          farmDistrict={farmDistrict}
          profileUnknown={profileUnknown}
          onOpenProfile={openFarmProfileEditor}
          onOpenManageParcels={openManageParcels}
          section={section}
          onSelectSection={selectSection}
        />

        {/* WEATHER STRIP (farm district by default; device location only when chosen) */}
        {section !== 'admin' && (
          <WeatherPanel
            profile={profile}
            profileUnknown={profileUnknown}
            onOpenProfile={openFarmProfileEditor}
          />
        )}

        {/* WORKSPACE: sidebar drawer + chat, claims section, or the admin review workflow */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {section === 'admin' ? (
            !isAdmin ? (
              // Non-admin fallback: the signed role can never unlock this section — render a
              // benign empty state rather than pretending an admin surface exists.
              <main className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center text-sm text-ink-subtle">
                {t('adminSectionDenied')}
              </main>
            ) : (
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                <AdminReviewPage />
              </main>
            )
          ) : section === 'claims' ? (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ClaimsPage profile={profile} />
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
            <Button variant="secondary" size="sm" onClick={() => void loadProfile()}>
              {t('retry')}
            </Button>
          </div>
        )}

        {/* ONBOARDING — optional, non-blocking, location-independent. Never over the admin review
            workspace: a reviewer there has no farm to describe, and the modal covered the queue
            (found by e2e E2E-19a/b; RT-9). */}
        {profileStatus === 'missing' && !profileSkipped && section !== 'admin' && (
          <ProfileOnboarding
            onComplete={(savedProfile) => {
              setProfile(savedProfile);
              setProfileStatus('loaded');
            }}
            onSkip={() => setProfileSkipped(true)}
          />
        )}

        {/* FARM PROFILE EDITOR MODAL */}
        {showFarmProfileEditor && (
          <FarmProfileEditor
            existingProfile={farmProfileEditorProfile}
            onComplete={handleFarmProfileEditorComplete}
            onCancel={() => setShowFarmProfileEditor(false)}
          />
        )}

        {/* MANAGE PARCELS MODAL */}
        {showManageParcels && (
          <ManageParcels
            onClose={handleManageParcelsClose}
            onParcelsChange={handleManageParcelsClose}
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