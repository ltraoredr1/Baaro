import { useState, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { ToastProvider } from "./components/ToastContext.jsx";
import { Header } from "./components/Header.jsx";
import { Navigation } from "./components/Navigation.jsx";
import { FeedTab } from "./components/FeedTab.jsx";
import { VideosTab } from "./components/VideosTab.jsx";
import { MessagesTab } from "./components/MessagesTab.jsx";
import { WalletTab } from "./components/WalletTab.jsx";
import { CryptoTab } from "./components/CryptoTab.jsx";
import DebatesTab from "./components/DebatesTab.jsx";
import { OfflineTab } from "./components/OfflineTab.jsx";
import { AiAssistantTab } from "./components/AiAssistantTab.jsx";
import { SettingsTab } from "./components/SettingsTab.jsx";
import { ProfileModal } from "./components/ProfileModal.jsx";
import { NotificationDrawer } from "./components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "./components/GlobalSearchModal.jsx";
import { FriendsTab } from "./components/FriendsTab.jsx";
import { COLORS } from "./theme.js";
import AuthScreen from "./components/AuthScreen.jsx";

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

function MainAppContent() {
  const [activeTab, setActiveTab] = useState("feed");
  const [lang, setLang] = useState("fr");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [baroBalance, setBaroBalance] = useState(0);
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState({
    display_name: "Membre BAARO",
    handle: "@membre",
    flag: "🌍",
    bio: "",
  });

  // Charge l'utilisateur + son profil + ses soldes
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        setUserId(user.id);

        // Profil
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, handle, flag, bio")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile) {
          setUserProfile({
            display_name: profile.display_name || "Membre BAARO",
            handle: profile.handle || "@membre",
            flag: profile.flag || "🌍",
            bio: profile.bio || "",
          });
        } else {
          // Crée le profil s'il n'existe pas encore
          await supabase.from("profiles").upsert({
            user_id: user.id,
            display_name: "Membre BAARO",
            handle: `@user_${user.id.slice(0, 8)}`,
            flag: "🌍",
          });
        }

        // Solde points
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();

        if (wallet) {
          setPointsBalance(Number(wallet.balance) || 0);
        }

        // Solde BARO
        const { data: crypto } = await supabase
          .from("crypto_holdings")
          .select("holdings")
          .eq("user_id", user.id)
          .maybeSingle();

        if (crypto) {
          setBaroBalance(Number(crypto.holdings) || 0);
        }
      } catch (error) {
        console.error("Erreur chargement données utilisateur:", error);
      }
    };

    loadUserData();
  }, []);

  // Mise à jour optimiste des points (sera remplacé plus tard par useWallet)
  const handleRewardPoints = useCallback((pts) => {
    setPointsBalance((prev) => prev + pts);
  }, []);

  const themeBg = THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-500"
      style={{ background: themeBg, color: COLORS.ivory }}
    >
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

        <main className="md:col-span-3">
          {activeTab === "feed" && (
            <FeedTab
              userId={userId}
              onOpenProfile={(authorId) => setInspectingProfileId(authorId)}
              onRewardPoints={handleRewardPoints}
            />
          )}
          {activeTab === "friends" && <FriendsTab />}
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
            <DebatesTab
              currentUserId={userId}
              onRewardPoints={handleRewardPoints}
            />
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
        onSelectUser={(id) => setInspectingProfileId(id)}
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0B1220", color: "white" }}
      >
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
