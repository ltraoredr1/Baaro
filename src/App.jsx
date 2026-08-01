import { useState, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { ToastProvider, useToast } from "./components/ToastContext.jsx";
import { Header } from "./components/Header.jsx";
import { Navigation } from "./components/Navigation.jsx";
import { FeedTab } from "./components/FeedTab.jsx";
import { VideosTab } from "./components/VideosTab.jsx";
import { MessagesTab } from "./components/MessagesTab.jsx";
import { WalletTab } from "./components/WalletTab.jsx";
import { CryptoTab } from "./components/CryptoTab.jsx";
import { DebatesTab } from "./components/DebatesTab.jsx";
import { OfflineTab } from "./components/OfflineTab.jsx";
import { AiAssistantTab } from "./components/AiAssistantTab.jsx";
import { SettingsTab } from "./components/SettingsTab.jsx";
import { ProfileModal } from "./components/ProfileModal.jsx";
import { NotificationDrawer } from "./components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "./components/GlobalSearchModal.jsx";
import { COLORS } from "./theme.js";
import AuthScreen from "./components/AuthScreen.jsx";
import { FriendsTab } from './components/FriendsTab.jsx'; // ← AJOUT

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

function MainAppContent() {
  const [activeTab, setActiveTab] = useState("feed");
  const [lang, setLang] = useState("fr");
  const [pointsBalance, setPointsBalance] = useState(240);
  const [baroBalance, setBaroBalance] = useState(2.40);
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("midnight");

  const [userProfile, setUserProfile] = useState({
    display_name: "Membre BAARO",
    handle: "@mon_compte",
    flag: "🌍",
    bio: "Passionné de Web3, de réseaux décentralisés et d'impact social."
  });

  const handleRewardPoints = useCallback((pts) => {
    setPointsBalance((prev) => prev + pts);
  }, []);

  const themeBg = THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-500" style={{ background: themeBg, color: COLORS.ivory }}>
      <Header
        lang={lang}
        setLang={setLang}
        pointsBalance={pointsBalance}
        baroBalance={baroBalance}
        userProfile={userProfile}
        onOpenProfile={() => setInspectingProfileId("u_amina")}
        onOpenNotifications={() => setNotifDrawerOpen(true)}
        onOpenSearch={() => setSearchModalOpen(true)}
      />

      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        <main className="md:col-span-3">
          {activeTab === "feed" && (
            <FeedTab
              userId="u_me"
              onOpenProfile={(authorId) => setInspectingProfileId(authorId)}
              onRewardPoints={handleRewardPoints}
            />
          )}

          {activeTab === "friends" && <FriendsTab />} {/* ← AJOUT */}

          {activeTab === "videos" && (
            <VideosTab onRewardPoints={handleRewardPoints} />
          )}

          {activeTab === "messages" && (
            <MessagesTab onRewardPoints={handleRewardPoints} />
          )}

          {activeTab === "wallet" && (
            <WalletTab
              pointsBalance={pointsBalance}
              baroBalance={baroBalance}
              onRewardPoints={handleRewardPoints}
              onNavigateToCrypto={() => setActiveTab("crypto")}
            />
          )}

          {activeTab === "crypto" && (
            <CryptoTab
              pointsBalance={pointsBalance}
              baroBalance={baroBalance}
              onRewardPoints={handleRewardPoints}
              setPointsBalance={setPointsBalance}
              setBaroBalance={setBaroBalance}
            />
          )}

          {activeTab === "debates" && (
            <DebatesTab onRewardPoints={handleRewardPoints} />
          )}

          {activeTab === "offline" && (
            <OfflineTab onRewardPoints={handleRewardPoints} />
          )}

          {activeTab === "assistant" && (
            <AiAssistantTab onRewardPoints={handleRewardPoints} />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              userProfile={userProfile}
              setUserProfile={setUserProfile}
              currentTheme={currentTheme}
              onSelectTheme={setCurrentTheme}
            />
          )}
        </main>
      </div>

      {inspectingProfileId && (
        <ProfileModal
          authorId={inspectingProfileId}
          onClose={() => setInspectingProfileId(null)}
          onNavigateToMessages={() => setActiveTab("messages")}
        />
      )}

      <NotificationDrawer
        isOpen={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
      />

      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={(userId) => setInspectingProfileId(userId)}
        onSelectTab={(tabId) => setActiveTab(tabId)}
      />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1220", color: "white" }}>
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p>Chargement de BAARO...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <ToastProvider>
      <MainAppContent />
    </ToastProvider>
  );
}
