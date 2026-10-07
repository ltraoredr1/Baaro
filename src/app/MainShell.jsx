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
import { FutureModulePanel } from "../components/FutureModulePanel.jsx";
import { saveLastTab, loadLastTab } from "../lib/perf.js";

const THEME_BG_MAP = {
  midnight: "#0B1220",
  oled: "#000000",
  emerald: "#061A14",
};

const WELCOME_TOAST_KEY = "baaro:welcome_toast_shown";
const FALLBACK_COLORS = {
  ivory: "#F5F3EF",
};

export function MainShell() {
  const {
    user,
    userProfile,
    setUserProfile,
    isAnonymous,
  } = useApp();

  const { showToast } = useToast();
  const id = user?.id;

  useApplyPendingReferral({ showToast });

  const [activeTab, setActiveTab] = useState(() =>
    loadLastTab("feed")
  );

  const [lang, setLang] = useState("fr");
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [inspectingProfileId, setInspectingProfileId] = useState(null);
  const [profileReadOnly, setProfileReadOnly] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

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
            style:
              currentTheme === "midnight" ||
              currentTheme === "oled"
                ? Style.Dark
                : Style.Light,
          });

          await StatusBar.setBackgroundColor({
            color:
              THEME_BG_MAP[currentTheme] ||
              THEME_BG_MAP.midnight,
          });
        } catch {
          // StatusBar indisponible : continuer normalement
        }

        backListener = await CapApp.addListener(
          "backButton",
          ({ canGoBack }) => {
            /*
             * Fermer les overlays/modales en priorité.
             */
            if (
              notifDrawerOpen ||
              searchModalOpen ||
              inspectingProfileId ||
              forceOnboarding
            ) {
              setNotifDrawerOpen(false);
              setSearchModalOpen(false);
              setInspectingProfileId(null);
              setProfileReadOnly(false);
              setForceOnboarding(false);
              return;
            }

            /*
             * Retour depuis une page secondaire.
             */
            if (
              activeTab === "videos" ||
              activeTab === "privacy"
            ) {
              setActiveTab("feed");
              return;
            }

            /*
             * Retour général vers le Fil.
             */
            if (activeTab !== "feed") {
              setActiveTab("feed");
              return;
            }

            /*
             * Déjà sur le Fil : fermeture de l'application native.
             */
            CapApp.exitApp();
          }
        );
      } catch {
        /*
         * Web : Capacitor n'est pas disponible,
         * aucune action nécessaire.
         */
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
  ]);

  /* =========================================================
     WELCOME TOAST
     ========================================================= */
  useEffect(() => {
    if (!id) {
      return;
    }

    try {
      if (localStorage.getItem(WELCOME_TOAST_KEY)) {
        return;
      }
    } catch {
      // localStorage indisponible
    }

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(WELCOME_TOAST_KEY, "1");
      } catch {
        // localStorage indisponible
      }

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

    return () => {
      clearTimeout(timer);
    };
  }, [
    id,
    isAnonymous,
    showToast,
  ]);

  /* =========================================================
     LAST TAB
     ========================================================= */
  useEffect(() => {
    saveLastTab(activeTab);
  }, [activeTab]);

  /* =========================================================
     THEME / ACTIVE TAB
     ========================================================= */
  const themeBg =
    THEME_BG_MAP[currentTheme] ||
    THEME_BG_MAP.midnight;

  const isImmersive = activeTab === "videos";

  const Tab = tabs[activeTab] || null;

  /* =========================================================
     TAB PROPS
     ========================================================= */
  const tabProps = {
    innovation: { user_id: id },
    feed: {
      id,
      user_id: id,
      onOpenProfile: setInspectingProfileId,
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
    },

    debates: {
      id,
      currentUserId: id,
      onOpenProfile: setInspectingProfileId,
    },

    offline: {
    },

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
      onReplayOnboarding: () =>
        setForceOnboarding(true),
      onOpenPrivacy: () =>
        setActiveTab("privacy"),
    },

    shop: {
      id,
      user_id: id,
    },

    economy: { id },
  };

  /* =========================================================
     RENDER
     ========================================================= */
  return (
    <div
      className="min-h-screen min-h-[100dvh] flex flex-col transition-colors duration-500"
      style={{
        background: isImmersive ? "#000" : themeBg,
        color: COLORS.ivory,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <OfflineBanner />

      <OnboardingModal
        forceOpen={forceOnboarding}
        onClose={() => setForceOnboarding(false)}
      />

      {/* =====================================================
          HEADER
          ===================================================== */}
      {!isImmersive && (
        <Header
          lang={lang}
          setLang={setLang}
          userProfile={userProfile}
          onOpenProfile={() =>
            setInspectingProfileId(id)
          }
          onOpenNotifications={() =>
            setNotifDrawerOpen(true)
          }
          onOpenSearch={() =>
            setSearchModalOpen(true)
          }
        />
      )}

      {/* =====================================================
          MODE IMMERSIF
          ===================================================== */}
      {isImmersive ? (
        <main
          id="main-content"
          className="flex-1 relative mobile-nav-spacer"
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
                  <FutureModulePanel moduleId={activeTab} onNavigate={(moduleId, action) => {
                    if (/IA|intelligent|montage|traduction|mémoire/i.test(action)) setActiveTab("assistant");
                    else if (/sécurité|confidentialité|appareils|contrôles|export|privacy/i.test(action)) setActiveTab("settings");
                    else if (/communauté|modération/i.test(action)) setActiveTab("community");
                    else if (/recherche|historique/i.test(action)) setSearchModalOpen(true);
                    else if (/vidéo|Story/i.test(action)) setActiveTab(action.includes("Story") ? "stories" : "videos");
                  }} />
                </>
              ) : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        /* ===================================================
           MODE NORMAL
           =================================================== */
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1">
            <Navigation
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>

          <main
            id="main-content"
            className="md:col-span-3 mobile-nav-spacer"
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
                    <FutureModulePanel moduleId={activeTab} onNavigate={(moduleId, action) => {
                      if (/IA|intelligent|montage|traduction|mémoire/i.test(action)) setActiveTab("assistant");
                      else if (/sécurité|confidentialité|appareils|contrôles|export|privacy/i.test(action)) setActiveTab("settings");
                      else if (/communauté|modération/i.test(action)) setActiveTab("community");
                      else if (/recherche|historique/i.test(action)) setSearchModalOpen(true);
                      else if (/vidéo|Story/i.test(action)) setActiveTab(action.includes("Story") ? "stories" : "videos");
                    }} />
                  </>
                ) : null}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      )}

      {/* =====================================================
          NAVIGATION MOBILE EN MODE IMMERSIF
          ===================================================== */}
      {isImmersive && (
        <div className="md:hidden">
          <Navigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
      )}

      {/* =====================================================
          PROFILE MODAL
          ===================================================== */}
      {inspectingProfileId && (
        <ProfileModal
          id={inspectingProfileId}
          currentId={id}
          onClose={() => {
            setInspectingProfileId(null);
            setProfileReadOnly(false);
          }}
          onNavigateToMessages={() =>
            setActiveTab("messages")
          }
          onOpenSettings={() => {
            setInspectingProfileId(null);
            setProfileReadOnly(false);
            setActiveTab("settings");
          }}
          readOnly={profileReadOnly}
        />
      )}

      {/* =====================================================
          NOTIFICATIONS
          ===================================================== */}
      <NotificationDrawer
        isOpen={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        id={id}
      />

      {/* =====================================================
          GLOBAL SEARCH
          ===================================================== */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={(pid) => {
          setProfileReadOnly(true);
          setInspectingProfileId(pid);
        }}
        onSelectTab={(tid) =>
          setActiveTab(tid)
        }
        onSelectShop={() =>
          setActiveTab("shop")
        }
      />
    </div>
  );
}
