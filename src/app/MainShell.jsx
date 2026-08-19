import { useState, Suspense } from "react";
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

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

export function MainShell() {
  const {
    userId,
    userProfile,
    pointsBalance,
    baroBalance,
    earnPoints,
    setUserProfile,
  } = useApp();
  const { showToast } = useToast();

  useApplyPendingReferral({ showToast });

  const [activeTab, setActiveTab] = useState("feed");
  const [lang, setLang] = useState("fr");
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  const themeBg = THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;
  const Tab = tabs[activeTab] || null;

  const tabProps = {
    feed: {
      userId,
      onOpenProfile: (authorId) => setInspectingProfileId(authorId),
      onRewardPoints: earnPoints,
    },
    friends: { currentUserId: userId },
    videos: { userId, onRewardPoints: earnPoints },
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
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-500"
      style={{ background: themeBg, color: COLORS.ivory }}
    >
      <OnboardingModal
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />

      <Header
        lang={lang}
        setLang={setLang}
        pointsBalance={pointsBalance}
        baroBalance={baroBalance}
        userProfile={userProfile}
        onOpenProfile={() => setInspectingProfileId(userId)}
        onOpenNotifications={() => setNotifDrawerOpen(true)}
        onOpenSearch={() => setSearchModalOpen(true)}
      />

      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        <main className="md:col-span-3 mobile-nav-spacer">
          <ErrorBoundary>
            <Suspense fallback={<TabFallback />}>
              {Tab ? <Tab {...(tabProps[activeTab] || {})} /> : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

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
