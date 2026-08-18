import { useState, lazy, Suspense } from "react";
import { useApp } from "./contexts/AppContext.jsx";
import { Header } from "./components/Header.jsx";
import { Navigation } from "./components/Navigation.jsx";
import { FeedTab } from "./components/FeedTab.jsx";
import { VideosTab } from "./components/VideosTab.jsx";
import { MessagesTab } from "./components/MessagesTab.jsx";
import { WalletTab } from "./components/WalletTab.jsx";
import { CryptoTab } from "./components/CryptoTab.jsx";
import { FriendsTab } from "./components/FriendsTab.jsx";
import { SettingsTab } from "./components/SettingsTab.jsx";
import { ProfileModal } from "./components/ProfileModal.jsx";
import { NotificationDrawer } from "./components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "./components/GlobalSearchModal.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { OnboardingModal } from "./components/OnboardingModal.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import { useApplyPendingReferral } from "./hooks/useApplyPendingReferral.js";
import { useToast } from "./components/ToastContext.jsx";
import { COLORS } from "./theme.js";

const DebatesTab = lazy(() => import("./components/DebatesTab.jsx"));
const OfflineTab = lazy(() => import("./components/OfflineTab.jsx"));
const AiAssistantTab = lazy(() => import("./components/AiAssistantTab.jsx"));

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

function LoadingScreen({ message = "Chargement de BAARO..." }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0B1220", color: "white" }}
    >
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">⏳</div>
        <p>{message}</p>
      </div>
    </div>
  );
}

function TabFallback() {
  return (
    <div
      className="flex items-center justify-center py-20 text-sm"
      style={{ color: COLORS.muted }}
    >
      Chargement de l&apos;onglet…
    </div>
  );
}

function MainAppContent() {
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

        {/* mobile-nav-spacer = padding bas pour ne pas passer sous la barre */}
        <main className="md:col-span-3 mobile-nav-spacer">
          <ErrorBoundary>
            {activeTab === "feed" && (
              <FeedTab
                userId={userId}
                onOpenProfile={(authorId) => setInspectingProfileId(authorId)}
                onRewardPoints={earnPoints}
              />
            )}

            {activeTab === "friends" && <FriendsTab currentUserId={userId} />}

            {activeTab === "videos" && (
              <VideosTab userId={userId} onRewardPoints={earnPoints} />
            )}

            {activeTab === "messages" && (
              <MessagesTab userId={userId} onRewardPoints={earnPoints} />
            )}

            {activeTab === "wallet" && (
              <WalletTab onNavigateToCrypto={() => setActiveTab("crypto")} />
            )}

            {activeTab === "crypto" && <CryptoTab />}

            {activeTab === "debates" && (
              <Suspense fallback={<TabFallback />}>
                <DebatesTab
                  currentUserId={userId}
                  onRewardPoints={earnPoints}
                />
              </Suspense>
            )}

            {activeTab === "offline" && (
              <Suspense fallback={<TabFallback />}>
                <OfflineTab onRewardPoints={earnPoints} />
              </Suspense>
            )}

            {activeTab === "assistant" && (
              <Suspense fallback={<TabFallback />}>
                <AiAssistantTab
                  userId={userId}
                  userProfile={userProfile}
                  pointsBalance={pointsBalance}
                  baroBalance={baroBalance}
                  onRewardPoints={earnPoints}
                />
              </Suspense>
            )}

            {activeTab === "settings" && (
              <SettingsTab
                userId={userId}
                userProfile={userProfile}
                setUserProfile={setUserProfile}
                currentTheme={currentTheme}
                onSelectTheme={setCurrentTheme}
                onReplayOnboarding={() => setForceOnboarding(true)}
              />
            )}
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

export default function App() {
  const { session, loading } = useApp();

  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  return <MainAppContent />;
}
