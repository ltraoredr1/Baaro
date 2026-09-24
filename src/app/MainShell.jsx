import { AnimatedTab } from "../components/ui/AnimatedTab.jsx";
import { useEffect, useState, Suspense } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import { Header } from "../components/Header.jsx";
import { Navigation } from "../components/Navigation.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import { NotificationDrawer } from "../components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "../components/GlobalSearchModal.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { OnboardingModal } from "../features/profile/index.js";
import { useApplyPendingReferral } from "../hooks/useApplyPendingReferral.js";
import { useToast } from "../components/ToastContext.jsx";
import { COLORS as THEME_COLORS } from "../theme.js";
import { tabs } from "./tabs.jsx";
import { TabFallback } from "./TabFallback.jsx";
import { OfflineBanner } from "../components/OfflineBanner.jsx";
import { saveLastTab, loadLastTab } from "../lib/perf.js";

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

const WELCOME_TOAST_KEY = "baaro:welcome_toast_shown";
const FALLBACK_COLORS = { ivory: "#F5F3EF" };

export function MainShell() {
  const { user, userProfile, pointsBalance, baroBalance, earnPoints, setUserProfile, isAnonymous } = useApp();
  const { showToast, showPointsReward } = useToast();
  const id = user?.id;

  useApplyPendingReferral({ showToast });

  const [activeTab, setActiveTab] = useState(() => loadLastTab("feed"));
  const [lang, setLang] = useState("fr");
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [pulsePoints, setPulsePoints] = useState(false);

  const COLORS = {...FALLBACK_COLORS,...(THEME_COLORS || {}) };

  // --- FIX NATIF BAARO - SAFE WEB ---
  useEffect(() => {
    let backListener = null;
    let cancelled = false;

    const initNative = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const [{ App: CapApp }, { StatusBar, Style }] = await Promise.all([
          import('@capacitor/app'),
          import('@capacitor/status-bar'),
        ]);
        if (cancelled) return;

        try {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setStyle({ style: currentTheme === 'midnight' || currentTheme === 'oled'? (await import('@capacitor/status-bar')).Style.Dark : Style.Light });
          await StatusBar.setBackgroundColor({ color: THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight });
        } catch {}

        backListener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (notifDrawerOpen || searchModalOpen || inspectingProfileId || forceOnboarding) {
            setNotifDrawerOpen(false);
            setSearchModalOpen(false);
            setInspectingProfileId(null);
            setForceOnboarding(false);
            return;
          }
          if (activeTab === 'videos' || activeTab === 'privacy') {
            setActiveTab('feed'); return;
          }
          if (activeTab!== 'feed') {
            setActiveTab('feed'); return;
          }
          CapApp.exitApp();
        });
      } catch {
        // Web -> on ignore
      }
    };

    initNative();
    return () => {
      cancelled = true;
      backListener?.remove();
    };
  }, [activeTab, currentTheme, notifDrawerOpen, searchModalOpen, inspectingProfileId, forceOnboarding]);

  useEffect(() => {
    if (!id) return;
    try { if (localStorage.getItem(WELCOME_TOAST_KEY)) return; } catch {}
    const timer = setTimeout(() => {
      try { localStorage.setItem(WELCOME_TOAST_KEY, "1"); } catch {}
      if (isAnonymous) {
        showToast("Bienvenue! Explore librement. Crée un compte pour gagner.", "info", 5500);
      } else if (pointsBalance > 0) {
        showPointsReward(pointsBalance >= 50? 50 : pointsBalance, "Bonus de bienvenue");
      } else {
        showToast("Bienvenue sur BAARO — like, publie et débat pour gagner.", "info", 4500);
      }
      setPulsePoints(true);
      setTimeout(()=>setPulsePoints(false), 3000);
    }, 900);
    return () => clearTimeout(timer);
  }, [id, isAnonymous, pointsBalance, showToast, showPointsReward]);

  useEffect(() => { saveLastTab(activeTab); }, [activeTab]);

  const themeBg = THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;
  const isImmersive = activeTab === "videos";
  const Tab = tabs[activeTab] || null;

  const tabProps = {
    feed: { id, userId: id, onOpenProfile: setInspectingProfileId, onRewardPoints: earnPoints },
    friends: { id, onOpenProfile: setInspectingProfileId },
    community: { id, userId: id, onOpenProfile: setInspectingProfileId },
    companies: { id, onOpenProfile: setInspectingProfileId },
    discover: { userId: id, onOpenPost: () => setActiveTab("feed"), onOpenLive: () => setActiveTab("debates"), onOpenProfile: setInspectingProfileId },
    privacy: { onBack: () => setActiveTab("settings") },
    videos: { id, onRewardPoints: earnPoints, onExit: () => setActiveTab("feed") },
    messages: { id, onRewardPoints: earnPoints, onOpenProfile: setInspectingProfileId },
    wallet: { onNavigateToCrypto: () => setActiveTab("crypto") },
    crypto: {},
    debates: { id, currentUserId: id, onRewardPoints: earnPoints, onOpenProfile: setInspectingProfileId },
    offline: { onRewardPoints: earnPoints },
    assistant: { id, userProfile, pointsBalance, baroBalance, onRewardPoints: earnPoints },
    settings: { id, userProfile, setUserProfile, currentTheme, onSelectTheme: setCurrentTheme, onReplayOnboarding: () => setForceOnboarding(true), onOpenPrivacy: () => setActiveTab("privacy") },
    shop: { id, userId: id },
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col transition-colors duration-500" style={{ background: isImmersive? "#000" : themeBg, color: COLORS.ivory, paddingTop: 'env(safe-area-inset-top)' }}>
      <OfflineBanner />
      <OnboardingModal forceOpen={forceOnboarding} onClose={() => setForceOnboarding(false)} />

      {!isImmersive && (
        <Header lang={lang} setLang={setLang} pointsBalance={pointsBalance} baroBalance={baroBalance} userProfile={userProfile} onOpenProfile={() => setInspectingProfileId(id)} onOpenNotifications={() => setNotifDrawerOpen(true)} onOpenSearch={() => setSearchModalOpen(true)} pulsePoints={pulsePoints} />
      )}

      {isImmersive? (
        <main id="main-content" className="flex-1 relative" tabIndex={-1}>
          <ErrorBoundary><Suspense fallback={<TabFallback />}>{Tab? <Tab {...(tabProps[activeTab] || {})} /> : null}</Suspense></ErrorBoundary>
        </main>
      ) : (
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1"><Navigation activeTab={activeTab} setActiveTab={setActiveTab} /></div>
          <main id="main-content" className="md:col-span-3 mobile-nav-spacer" tabIndex={-1}>
            <ErrorBoundary><Suspense fallback={<TabFallback />}>{Tab? <Tab {...(tabProps[activeTab] || {})} /> : null}</Suspense></ErrorBoundary>
          </main>
        </div>
      )}

      {isImmersive && <div className="md:hidden"><Navigation activeTab={activeTab} setActiveTab={setActiveTab} /></div>}

      {inspectingProfileId && (
        <ProfileModal id={inspectingProfileId} currentId={id} onClose={() => setInspectingProfileId(null)} onNavigateToMessages={() => setActiveTab("messages")} onOpenSettings={() => { setInspectingProfileId(null); setActiveTab("settings"); }} />
      )}
      <NotificationDrawer isOpen={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} id={id} />
      <GlobalSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} onSelectUser={(pid) => setInspectingProfileId(pid)} onSelectTab={(tid) => setActiveTab(tid)} onSelectShop={() => setActiveTab("shop")} />
    </div>
  );
}
