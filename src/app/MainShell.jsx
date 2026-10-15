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
import { applySettingsToDom, loadLocalSettings } from "../lib/appSettings.js";
import { tabs } from "./tabs.jsx";
import { TabFallback } from "./TabFallback.jsx";
import { OfflineBanner } from "../components/OfflineBanner.jsx";
import { FutureModulePanel } from "../components/FutureModulePanel.jsx";
import { saveLastTab, loadLastTab } from "../lib/perf.js";
import { useCryptoKeys } from "../hooks/useCryptoKeys.js";
import { useIncomingCalls } from "../hooks/useIncomingCalls.js";
import { ChatCallModal } from "../components/ChatCallModal.jsx";
import FloatingAiAssistant from "../components/FloatingAiAssistant.jsx";

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
  light: "#F8FAFC",
  sunset: "#2A1215",
  ocean: "#0A1628",
  forest: "#0E1F14",
  desert: "#1F1A14",
  custom: "#0B1220",
};

const WELCOME_TOAST_KEY = "baaro:welcome_toast_shown";
const FALLBACK_COLORS = {
  ivory: "#F5F3EF",
};

function LockedMessages({ onCreateAccount }) {
  return (
    <div className="max-w-md mx-auto text-center p-8 mt-10 rounded-3xl border"
         style={{ borderColor: "rgba(217,174,82,0.2)", background: "rgba(255,255,255,0.04)" }}>
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="font-bold text-lg mb-2" style={{ color: "#F5F3EF" }}>Messagerie réservée aux comptes</h2>
      <p className="text-sm mb-5" style={{ color: "rgba(245,243,239,0.6)" }}>
        Crée un compte pour discuter en privé et passer des appels.
      </p>
      <button onClick={onCreateAccount} className="px-5 py-3 rounded-xl font-bold text-sm"
              style={{ background: "#D9AE52", color: "#000" }}>
        Créer un compte
      </button>
    </div>
  );
}

export function MainShell() {
  const {
    user,
    userProfile,
    setUserProfile,
    isAnonymous,
  } = useApp();

  const { showToast } = useToast();
  const id = user?.id;
  useCryptoKeys(isAnonymous ? null : id);
  const { incoming, clear: clearIncoming } = useIncomingCalls(isAnonymous ? null : id);

  useApplyPendingReferral({ showToast });

  const [activeTab, setActiveTab] = useState(() =>
    loadLastTab("feed")
  );

  const [lang, setLang] = useState("fr");
  const [currentTheme, setCurrentTheme] = useState(() => {
    try { return localStorage.getItem("baaro_theme") || "midnight"; } catch { return "midnight"; }
  });

  useEffect(() => { applySettingsToDom(loadLocalSettings()); }, []);
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [profileReadOnly, setProfileReadOnly] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // --- ÉTAT GLOBAL POUR LA MODALE DE CRÉATION ---
  const [isFeedCreateOpen, setIsFeedCreateOpen] = useState(false);

  const COLORS = {
    ...FALLBACK_COLORS,
    ...(THEME_COLORS || {}),
  };

  /* =========================================================
     NATIVE BACK BUTTON / STATUS BAR
     ========================================================= */
  useEffect(() => {
    let backListener = null;
    let cancelled = false;

    const initNative = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");

        if (!Capacitor.isNativePlatform() || cancelled) {
          return;
        }

        const [{ App: CapApp }, { StatusBar, Style }] =
          await Promise.all([
            import("@capacitor/app"),
            import("@capacitor/status-bar"),
          ]);

        if (cancelled) {
          return;
        }

        try {
          await StatusBar.setOverlaysWebView({
            overlay: false,
          });

          await StatusBar.setStyle({
            style: currentTheme === "light" ? Style.Light : Style.Dark,
          });

          await StatusBar.setBackgroundColor({
            color:
              THEME_BG_MAP[currentTheme] ||
              THEME_BG_MAP.midnight,
          });
        } catch {
          // StatusBar indisponible
        }

        backListener = await CapApp.addListener(
          "backButton",
          ({ canGoBack }) => {
            if (
              notifDrawerOpen ||
              searchModalOpen ||
              inspectingProfileId ||
              forceOnboarding ||
              isFeedCreateOpen
            ) {
              setNotifDrawerOpen(false);
              setSearchModalOpen(false);
              setInspectingProfileId(null);
              setProfileReadOnly(false);
              setForceOnboarding(false);
              setIsFeedCreateOpen(false);
              return;
            }

            if (
              activeTab === "videos" ||
              activeTab === "privacy"
            ) {
              setActiveTab("feed");
              return;
            }

            if (activeTab !== "feed") {
              setActiveTab("feed");
              return;
            }

            CapApp.exitApp();
          }
        );
      } catch {
        // Web
      }
    };

    initNative();

    return () => {
      cancelled = true;
      if (backListener) {
        backListener.remove();
      }
    };
  }, [
    activeTab,
    currentTheme,
    notifDrawerOpen,
    searchModalOpen,
    inspectingProfileId,
    forceOnboarding,
    isFeedCreateOpen,
  ]);

  /* =========================================================
     WELCOME TOAST
     ========================================================= */
  useEffect(() => {
    if (!id) return;

    try {
      if (localStorage.getItem(WELCOME_TOAST_KEY)) return;
    } catch {}

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(WELCOME_TOAST_KEY, "1");
      } catch {}

      if (isAnonymous) {
        showToast(
          "Bienvenue! Explore librement. Crée un compte pour gagner.",
          "info",
          5500
        );
      } else {
        showToast(
          "Bienvenue sur BAARO — like, publie et débat pour gagner.",
          "info",
          4500
        );
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [id, isAnonymous, showToast]);

  useEffect(() => {
    saveLastTab(activeTab);
  }, [activeTab]);

  const isImmersive = activeTab === "videos";

  const Tab = activeTab === "messages" && isAnonymous
    ? LockedMessages
    : (tabs[activeTab] || null);

  /* =========================================================
     TAB PROPS
     ========================================================= */
  const tabProps = {
    innovation: { user_id: id },
    feed: {
      id,
      user_id: id,
      onOpenProfile: setInspectingProfileId,
      onOpenDebates: () => setActiveTab("debates"),
      isCreateOpen: isFeedCreateOpen,
      setIsCreateOpen: setIsFeedCreateOpen,
    },

    friends: {
      id,
      onOpenProfile: setInspectingProfileId,
    },

    stories: { id, onOpenProfile: setInspectingProfileId },

    community: {
      id,
      user_id: id,
      onOpenProfile: setInspectingProfileId,
    },

    companies: {
      id,
      onOpenProfile: setInspectingProfileId,
    },

    discover: {
      user_id: id,
      onOpenPost: () => setActiveTab("feed"),
      onOpenLive: () => setActiveTab("debates"),
      onOpenProfile: setInspectingProfileId,
    },

    privacy: {
      onBack: () => setActiveTab("settings"),
    },

    videos: {
      id,
      onExit: () => setActiveTab("feed"),
    },

    messages: {
      id,
      onOpenProfile: setInspectingProfileId,
      onCreateAccount: () => setActiveTab("settings"),
    },

    debates: {
      id,
      currentUserId: id,
      onOpenProfile: setInspectingProfileId,
    },

    offline: {},

    assistant: {
      id,
      userProfile,
    },

    settings: {
      id,
      userProfile,
      setUserProfile,
      currentTheme,
      onSelectTheme: setCurrentTheme,
      onReplayOnboarding: () => setForceOnboarding(true),
      onOpenPrivacy: () => setActiveTab("privacy"),
    },

    shop: {
      id,
      user_id: id,
    },

    economy: { id },
  };

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex flex-col transition-colors duration-500"
      style={{
        background: isImmersive ? "#000" : "transparent",
        color: COLORS.ivory,
        paddingTop: isImmersive ? "0px" : "env(safe-area-inset-top)",
      }}
    >
      {incoming && <ChatCallModal mode="incoming" {...incoming} onClose={clearIncoming} />}
      <OfflineBanner />

      <OnboardingModal
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />

      {/* =====================================================
          HEADER (MASQUÉ EN MODE VIDÉOS POUR IMMERSION TOTALE)
          ===================================================== */}
      {!isImmersive && (
        <Header
          lang={lang}
          setLang={setLang}
          userProfile={userProfile}
          onOpenProfile={() => setInspectingProfileId(id)}
          onOpenNotifications={() => setNotifDrawerOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          isCreateOpen={activeTab === "feed" ? isFeedCreateOpen : false}
          onToggleCreate={() => {
            if (activeTab !== "feed") {
              setActiveTab("feed");
            }
            setIsFeedCreateOpen((prev) => !prev);
          }}
        />
      )}

      {/* =====================================================
          CONTENU PRINCIPAL
          ===================================================== */}
      <div className={`mx-auto w-full flex-1 ${isImmersive ? "max-w-none px-0 pt-0 flex flex-col" : "max-w-7xl px-3 sm:px-6 pt-4 sm:pt-6 grid grid-cols-1 md:grid-cols-4 gap-6"}`}>
        {!isImmersive && (
          <div className="hidden md:block md:col-span-1">
            <Navigation
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>
        )}

        <main
          id="main-content"
          className={isImmersive ? "w-full flex-1 flex flex-col" : "col-span-1 md:col-span-3 mobile-nav-spacer"}
          tabIndex={-1}
        >
          <ErrorBoundary>
            <Suspense fallback={<TabFallback />}>
              {Tab ? (
                <>
                  <Tab
                    key={activeTab}
                    {...(tabProps[activeTab] || {})}
                  />
                  {!isImmersive && (
                    <FutureModulePanel moduleId={activeTab} onNavigate={(moduleId, action) => {
                      if (/IA|intelligent|montage|traduction|mémoire/i.test(action)) setActiveTab("assistant");
                      else if (/sécurité|confidentialité|appareils|contrôles|export|privacy/i.test(action)) setActiveTab("settings");
                      else if (/communauté|modération/i.test(action)) setActiveTab("community");
                      else if (/recherche|historique/i.test(action)) setSearchModalOpen(true);
                      else if (/vidéo|Story/i.test(action)) setActiveTab(action.includes("Story") ? "stories" : "videos");
                    }} />
                  )}
                </>
              ) : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* NAVIGATION MOBILE (MASQUÉE EN MODE VIDÉOS) */}
      {!isImmersive && (
        <div className="md:hidden">
          <Navigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
      )}

      {/* MODALES ET ASSISTANT */}
      {inspectingProfileId && (
        <ProfileModal
          id={inspectingProfileId}
          currentId={id}
          onClose={() => {
            setInspectingProfileId(null);
            setProfileReadOnly(false);
          }}
          onNavigateToMessages={() => {
            if (!isAnonymous) { try { sessionStorage.setItem("baaro:open_chat_with", inspectingProfileId); } catch {} }
            setInspectingProfileId(null);
            setProfileReadOnly(false);
            setActiveTab("messages");
          }}
          onOpenSettings={() => {
            setInspectingProfileId(null);
            setProfileReadOnly(false);
            setActiveTab("settings");
          }}
          readOnly={profileReadOnly}
        />
      )}

      <NotificationDrawer
        isOpen={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        user_id={id}
      />

      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={(pid) => {
          setProfileReadOnly(true);
          setInspectingProfileId(pid);
        }}
        onSelectTab={(tid) => setActiveTab(tid)}
        onSelectShop={() => setActiveTab("shop")}
      />

      {!isAnonymous && (
        <FloatingAiAssistant
          userProfile={userProfile}
          hidden={activeTab === "assistant"}
        />
      )}
    </div>
  );
}

export default MainShell;
