import { useState, useEffect, Suspense } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import { Header } from "../components/Header.jsx";
import { Navigation } from "../components/Navigation.jsx";
import { ProfileModal } from "../features/profile/index.js";
import { NotificationDrawer } from "../components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "../components/GlobalSearchModal.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { OnboardingModal } from "../features/profile/index.js";
import { useApplyPendingReferral } from "../hooks/useApplyPendingReferral.js";
import { useToast } from "../components/ToastContext.jsx";
import { COLORS } from "../theme.js";
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

/**
 * Shell principal.
 * Mode immersif vidéos : Header masqué, barre de navigation mobile toujours visible.
 */
export function MainShell() {
  const {
    userId,
    userProfile,
    pointsBalance,
    baroBalance,
    earnPoints,
    setUserProfile,
    isAnonymous,
  } = useApp();
  const { showToast, showPointsReward } = useToast();

  useApplyPendingReferral({ showToast });

  const [activeTab, setActiveTab] = useState(() => loadLastTab("feed"));
  const [lang, setLang] = useState("fr");
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [pulsePoints, setPulsePoints] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(WELCOME_TOAST_KEY)) return;
    } catch {
      /* ignore */
    }

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(WELCOME_TOAST_KEY, "1");
      } catch {
        /* ignore */
      }

      if (isAnonymous) {
        showToast(
          "Bienvenue ! Explore librement. Crée un compte pour gagner et convertir des points.",
          "info",
          5500
        );
      } else if (pointsBalance > 0) {
        showPointsReward(
          pointsBalance >= 50 ? 50 : pointsBalance,
          "Bonus de bienvenue"
        );
        setPulsePoints(true);
      } else {
        showToast(
          "Bienvenue sur BAARO — like, publie et débat pour gagner des points.",
          "info",
          4500
        );
      }
      setPulsePoints(true);
    }, 900);

    return () => clearTimeout(timer);
  }, [userId, isAnonymous, pointsBalance, showToast, showPointsReward]);

  const themeBg = THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;

  useEffect(() => {
    saveLastTab(activeTab);
  }, [activeTab]);

  const isImmersive = activeTab === "videos";
  const Tab = tabs[activeTab] || null;

  const tabProps = {
    feed: {
      userId,
      onOpenProfile: (authorId) => setInspectingProfileId(authorId),
      onRewardPoints: earnPoints,
    },
    friends: { currentUserId: userId },
    videos: {
      userId,
      onRewardPoints: earnPoints,
      onExit: () => setActiveTab("feed"),
    },
    messages: { userId, onRewardPoints: earnPoints },
    wallet: { onNavigateToCrypto: () => setActiveTab("crypto") },
    crypto: {},
    debates: { currentUserId: userId, onRewardPoints: earnPoints },
    offline: { onRewardPoints: earnPoints },
    assistant: {
      userId,
      userProfile,
      pointsBalance,
      baroBalance,
      onRewardPoints: earnPoints,
    },
    settings: {
      userId,
      userProfile,
      setUserProfile,
      currentTheme,
      onSelectTheme: setCurrentTheme,
      onReplayOnboarding: () => setForceOnboarding(true),
    },
    shop: { userId },
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-500"
      style={{
        background: isImmersive ? "#000" : themeBg,
        color: COLORS.ivory,
      }}
    >
      <OfflineBanner />
      <OnboardingModal
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />

      {!isImmersive && (
        <Header
          lang={lang}
          setLang={setLang}
          pointsBalance={pointsBalance}
          baroBalance={baroBalance}
          userProfile={userProfile}
          onOpenProfile={() => setInspectingProfileId(userId)}
          onOpenNotifications={() => setNotifDrawerOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          pulsePoints={pulsePoints}
        />
      )}

      {isImmersive ? (
        <main id="main-content" className="flex-1 relative" tabIndex={-1}>
          <ErrorBoundary>
            <Suspense fallback={<TabFallback />}>
              {Tab ? <Tab {...(tabProps[activeTab] || {})} /> : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1">
            <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>
          <main
            id="main-content"
            className="md:col-span-3 mobile-nav-spacer"
            tabIndex={-1}
          >
            <ErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                {Tab ? <Tab {...(tabProps[activeTab] || {})} /> : null}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      )}

      {/* Nav mobile toujours visible, y compris en mode Vidéos */}
      {isImmersive && (
        <div className="md:hidden">
          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      )}

      {inspectingProfileId && (
        <ProfileModal
          authorId={inspectingProfileId}
          currentUserId={userId}
          onClose={() => setInspectingProfileId(null)}
          onNavigateToMessages={() => setActiveTab("messages")}
        />
      )}

      <NotificationDrawer
        isOpen={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        userId={userId}
      />

      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={(id) => setInspectingProfileId(id)}
        onSelectTab={(tabId) => setActiveTab(tabId)}
      />
    </div>
  );
}
