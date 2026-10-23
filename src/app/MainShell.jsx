import { useEffect, useRef, useState, Suspense } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import { Header } from "../components/Header.jsx";
import { Navigation } from "../components/Navigation.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import { NotificationDrawer } from "../components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "../components/GlobalSearchModal.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { OnboardingModal } from "../features/profile/index.js";
import { useApplyPendingReferral } from "../hooks/useApplyPendingReferral.js";
import { useSettings } from "../hooks/useSettings.js";
import { useToast } from "../components/ToastContext.jsx";
import { COLORS as THEME_COLORS } from "../theme.js";
import { FEED_REFRESH_EVENT, FEED_PULSE_EVENT, TabPulseStyles } from "../lib/feedTabRefresh.jsx";
import { tabs } from "./tabs.jsx";
import { TabFallback } from "./TabFallback.jsx";
import { OfflineBanner } from "../components/OfflineBanner.jsx";
import { FutureModulePanel } from "../components/FutureModulePanel.jsx";
import { saveLastTab, loadLastTab } from "../lib/perf.js";
// Chemin corrigé vers useCryptoKeys.js
import { useCryptoKeys } from "../features/messaging/hooks/useCryptoKeys.js";
import { useIncomingCalls } from "../features/messaging/hooks/useIncomingCalls.js";
import { ChatCallModal } from "../features/messaging/components/ChatCallModal.jsx";
import FloatingAiAssistant from "../components/FloatingAiAssistant.jsx";
import { GuideHost, ONBOARDING_CLOSED_EVENT } from "../features/guide/index.js";

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
const DOUBLE_TAP_DELAY = 350; // ms

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

  // Langue et thème : source unique = réglages (useSettings applique déjà le DOM,
  // le stockage local et le cloud). Plus d'état local ni de clé "baaro_theme".
  const { settings, update: updateSettings } = useSettings();
  const lang = settings.lang;
  const setLang = (l) => {
    if (l && l !== settings.lang) void updateSettings({ lang: l });
  };
  const currentTheme = settings.theme || "midnight";
  const setCurrentTheme = (themeId) => {
    if (themeId && themeId !== settings.theme) void updateSettings({ theme: themeId });
  };

  // Couleur de la barre de statut : suit la couleur choisie pour le thème « custom ».
  const statusBg =
    currentTheme === "custom"
      ? settings.customTheme?.bgColor || THEME_BG_MAP.custom
      : THEME_BG_MAP[currentTheme] || THEME_BG_MAP.midnight;

  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [profileReadOnly, setProfileReadOnly] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // --- ÉTAT GLOBAL POUR LA MODALE DE CRÉATION DU FIL & UI ---
  const [isFeedCreateOpen, setIsFeedCreateOpen] = useState(false);
  const [showUi, setShowUi] = useState(false);

  const COLORS = {
    ...FALLBACK_COLORS,
    ...(THEME_COLORS || {}),
  };

  /* =========================================================
     DOUBLE APPUI SUR L'ONGLET FEED : recharge le fil + animation
     ========================================================= */
  const lastFeedTapRef = useRef(0);

  const handleSetActiveTab = (tab) => {
    if (tab === "feed") {
      const now = Date.now();
      if (now - lastFeedTapRef.current < DOUBLE_TAP_DELAY) {
        lastFeedTapRef.current = 0;
        window.dispatchEvent(new CustomEvent(FEED_REFRESH_EVENT));
        window.dispatchEvent(new CustomEvent(FEED_PULSE_EVENT));
        if (activeTab === "feed") return;
      } else {
        lastFeedTapRef.current = now;
      }
    }
    setActiveTab(tab);
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
            color: statusBg,
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

            // La page « privacy » renvoie vers les réglages (comme son bouton Retour).
            if (activeTab === "privacy") {
              setActiveTab("settings");
              return;
            }

            if (activeTab === "videos") {
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

        // Démonté pendant l'await : on retire tout de suite l'écouteur
        // (sinon les écouteurs s'empilent à chaque changement d'onglet).
        if (cancelled) {
          backListener.remove();
          backListener = null;
        }
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
    statusBg,
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
      className="min-h-screen min-h-[100dvh] flex flex-col transition-colors duration-500 relative"
      style={{
        background: isImmersive ? "#000" : "transparent",
        color: COLORS.ivory,
        paddingTop: isImmersive && !showUi ? "0px" : "env(safe-area-inset-top)",
      }}
    >
      <TabPulseStyles />

      {incoming && <ChatCallModal mode="incoming" {...incoming} onClose={clearIncoming} />}
      <OfflineBanner />

      <OnboardingModal
        forceOpen={forceOnboarding}
        onClose={() => {
          setForceOnboarding(false);
          // Le guide (visite ou IA, au choix) se propose juste après l'introduction.
          window.dispatchEvent(new CustomEvent(ONBOARDING_CLOSED_EVENT));
        }}
      />

      {/* =====================================================
          HEADER (BOUTON CRÉER INTELLIGENT SELON L'ONGLET)
          ===================================================== */}
      {(!isImmersive || showUi) && (
        <Header
          lang={lang}
          setLang={setLang}
          userProfile={userProfile}
          onOpenProfile={() => setInspectingProfileId(id)}
          onOpenNotifications={() => setNotifDrawerOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          isCreateOpen={activeTab === "feed" ? isFeedCreateOpen : false}
          onToggleCreate={() => {
            if (activeTab === "feed") {
              setIsFeedCreateOpen((prev) => !prev);
            } else if (activeTab === "videos") {
              window.dispatchEvent(new CustomEvent("baaro:open-video-create"));
            }
          }}
        />
      )}

      {/* =====================================================
          BOUTON FLOTTANT TRANSPARENT (MODE VIDÉO)
          ===================================================== */}
      {isImmersive && (
        <div className="fixed top-4 left-4 z-[70] flex items-center">
          <button
            onClick={() => setShowUi((prev) => !prev)}
            className="px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 text-white text-xs font-semibold shadow-lg hover:bg-black/60 transition-all flex items-center gap-1.5"
            title={showUi ? "Masquer les menus" : "Afficher les menus"}
          >
            <span>{showUi ? "✕ Fermer" : "☰ Menus"}</span>
          </button>
        </div>
      )}

      {/* =====================================================
          CONTENU PRINCIPAL
          ===================================================== */}
      <div className={`mx-auto w-full flex-1 ${isImmersive && !showUi ? "max-w-none px-0 pt-0 flex flex-col" : "max-w-7xl px-3 sm:px-6 pt-4 sm:pt-6 grid grid-cols-1 md:grid-cols-4 gap-6"}`}>
        {(!isImmersive || showUi) && (
          <div className="hidden md:block md:col-span-1">
            <Navigation
              activeTab={activeTab}
              setActiveTab={handleSetActiveTab}
            />
          </div>
        )}

        <main
          id="main-content"
          className={isImmersive && !showUi ? "w-full flex-1 flex flex-col" : "col-span-1 md:col-span-3 mobile-nav-spacer"}
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
                  {(!isImmersive || showUi) && (
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

      {/* NAVIGATION MOBILE (AFFICHÉE SI NON IMMERSIF OU SI SHOWUI EST ACTIF) */}
      {(!isImmersive || showUi) && (
        <div className="md:hidden">
          <Navigation
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
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

      <GuideHost
        activeTab={activeTab}
        onNavigate={setActiveTab}
        isAnonymous={isAnonymous}
        displayName={userProfile?.display_name}
        suppressed={forceOnboarding || (isImmersive && !showUi)}
      />

      {!isAnonymous && (
        <FloatingAiAssistant
          userProfile={userProfile}
          hidden={activeTab === "assistant" || activeTab === "videos"}
        />
      )}
    </div>
  );
}

export default MainShell;
