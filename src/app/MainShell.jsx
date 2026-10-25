import { useEffect, useRef, useState, Suspense, lazy, memo } from "react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../contexts/AppContext.jsx";
import { Header } from "../components/Header.jsx";
import { Navigation } from "../components/Navigation.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
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
import { supabase } from "../supabaseClient.js";
// Chemin corrigé vers useCryptoKeys.js
import { useCryptoKeys } from "../features/messaging/hooks/useCryptoKeys.js";
import { useIncomingCalls } from "../features/messaging/hooks/useIncomingCalls.js";
import { useIncomingCallFromPush } from "../features/messaging/hooks/useIncomingCallFromPush.js";
import { messageService } from "../features/messaging/lib/messageService.js";
import { useNotificationSound } from "../hooks/useNotificationSound.js";
import AnimatedTab from "../components/ui/AnimatedTab.jsx";

// ---------------------------------------------------------------
// Modales / modules secondaires : chargés à la demande (hors du
// chemin critique du premier affichage).
// ---------------------------------------------------------------
const loadProfileModal = () => import("../components/ProfileModal.jsx");
const ProfileModal = lazy(loadProfileModal);

const loadChatCallModal = () =>
  import("../features/messaging/components/ChatCallModal.jsx").then((m) => ({
    default: m.ChatCallModal,
  }));
const ChatCallModal = lazy(loadChatCallModal);

const NotificationDrawer = lazy(() =>
  import("../components/NotificationDrawer.jsx").then((m) => ({ default: m.NotificationDrawer }))
);
const GlobalSearchModal = lazy(() =>
  import("../components/GlobalSearchModal.jsx").then((m) => ({ default: m.GlobalSearchModal }))
);
const OnboardingModal = lazy(() =>
  import("../features/profile/index.js").then((m) => ({ default: m.OnboardingModal }))
);
const GuideHost = lazy(() =>
  import("../features/guide/index.js").then((m) => ({ default: m.GuideHost }))
);
const FloatingAiAssistant = lazy(() => import("../components/FloatingAiAssistant.jsx"));

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

// Onglets « gardés en vie » : une fois visités, ils restent montés (cachés) et se
// ré-affichent instantanément, avec leurs données et leur position de défilement.
// Volontairement exclus : videos, debates, messages, assistant, settings, offline
// (temps réel / caméra / son / lecture au montage).
const KEEP_ALIVE_TABS = new Set(["feed", "discover", "friends", "community", "companies", "shop"]);

// Un onglet caché n'est jamais re-rendu par le shell (comparateur mémoïsé).
const KeepAliveSlot = memo(
  function KeepAliveSlot({ active, children }) {
    return (
      <div
        className={active ? "baaro-tab-in" : undefined}
        style={active ? undefined : { display: "none" }}
        aria-hidden={active ? undefined : true}
      >
        {children}
      </div>
    );
  },
  (prev, next) => !prev.active && !next.active
);

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
  const { incoming: realtimeIncoming, clear: clearRealtimeIncoming } = useIncomingCalls(isAnonymous ? null : id);
  const { incoming: pushIncoming, clear: clearPushIncoming } = useIncomingCallFromPush(isAnonymous ? null : id);
  const incoming = pushIncoming || realtimeIncoming;
  const clearIncoming = () => {
    clearPushIncoming();
    clearRealtimeIncoming();
  };
  const { playNotification } = useNotificationSound();
  // Référence stable : évite de recréer le canal temps réel si la fonction change.
  const playRef = useRef(playNotification);
  playRef.current = playNotification;

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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

  // Modules secondaires (guide, assistant flottant, tiroirs...) : montés quand le
  // navigateur est au repos, jamais pendant le premier affichage de l'onglet.
  const [lateReady, setLateReady] = useState(false);

  // État lu par l'écouteur du bouton Retour natif (évite de le ré-enregistrer
  // à chaque changement d'onglet).
  const navStateRef = useRef({});
  navStateRef.current = {
    activeTab,
    notifDrawerOpen,
    searchModalOpen,
    inspectingProfileId,
    forceOnboarding,
    isFeedCreateOpen,
  };

  // Onglets déjà visités parmi ceux gardés en vie.
  const keptRef = useRef(new Set());
  if (KEEP_ALIVE_TABS.has(activeTab)) keptRef.current.add(activeTab);

  // Montage différé des modules secondaires + préchargement des modales courantes.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setLateReady(true);
      loadChatCallModal().catch(() => {});
      loadProfileModal().catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 2500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(handle);
      };
    }
    const handle = setTimeout(run, 1500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, []);

  // Compteurs persistants : ils ne dépendent plus de l’ouverture du drawer ou de l’onglet Chat.
  // Premier calcul différé de 2 s (ne concurrence plus l'ouverture de l'onglet) et
  // rafales d'événements regroupées (anti-rebond 400 ms).
  useEffect(() => {
    if (!id || isAnonymous) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return undefined;
    }
    let alive = true;
    let debounce = null;

    const refreshCounters = async () => {
      const [conversations, notificationRows] = await Promise.all([
        messageService.getConversations(id).catch(() => []),
        supabase.from("notifications").select("notification_id").eq("user_id", id).eq("read", false).limit(100),
      ]);
      if (!alive) return;
      setUnreadMessages((conversations || []).filter((c) => c.unread).length);
      setUnreadNotifications(notificationRows.data?.length || 0);
    };

    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refreshCounters, 400);
    };

    const first = setTimeout(refreshCounters, 2000);

    const channel = supabase
      .channel(`global-baaro-events:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${id}` }, (payload) => {
        // Son uniquement pour un NOUVEAU message (pas quand on marque « lu »).
        if (payload?.eventType === "INSERT") playRef.current?.("baaro_pulse");
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${id}` }, () => scheduleRefresh())
      .subscribe();

    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [id, isAnonymous]);

  // Les push ouverts depuis Android/Web amènent directement au bon module.
  useEffect(() => {
    const onOpenMessage = () => setActiveTab("messages");
    window.addEventListener("baaro:open-message", onOpenMessage);
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("open_message")) {
        setActiveTab("messages");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {}
    return () => window.removeEventListener("baaro:open-message", onOpenMessage);
  }, []);

  useApplyPendingReferral({ showToast });

  // Les notifications push ouvrent la racine avec ?open_debate=<UUID>.
  // L'événement couvre aussi les clics depuis le drawer sans rechargement.
  useEffect(() => {
    const queueDebate = (roomId) => {
      if (!roomId) return;
      try {
        sessionStorage.setItem("baaro:open_debate", String(roomId));
      } catch {}
      setActiveTab("debates");
    };

    const onOpenDebate = (event) => {
      queueDebate(event.detail?.roomId || event.detail?.room_id);
    };

    window.addEventListener("baaro:open-debate", onOpenDebate);

    try {
      const params = new URLSearchParams(window.location.search);
      const roomId = params.get("open_debate");
      if (roomId) {
        queueDebate(roomId);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {}

    return () => window.removeEventListener("baaro:open-debate", onOpenDebate);
  }, []);

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
     NATIVE : BARRE DE STATUT (seulement si thème / couleur change)
     ========================================================= */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({
          style: currentTheme === "light" ? Style.Light : Style.Dark,
        });
        await StatusBar.setBackgroundColor({ color: statusBg });
      } catch {
        // StatusBar indisponible
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTheme, statusBg]);

  /* =========================================================
     NATIVE : BOUTON RETOUR (enregistré UNE seule fois)
     ========================================================= */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let backListener = null;
    let cancelled = false;

    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        if (cancelled) return;

        const l = await CapApp.addListener("backButton", () => {
          const s = navStateRef.current;

          if (
            s.notifDrawerOpen ||
            s.searchModalOpen ||
            s.inspectingProfileId ||
            s.forceOnboarding ||
            s.isFeedCreateOpen
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
          if (s.activeTab === "privacy") {
            setActiveTab("settings");
            return;
          }

          if (s.activeTab === "videos") {
            setActiveTab("feed");
            return;
          }

          if (s.activeTab !== "feed") {
            setActiveTab("feed");
            return;
          }

          CapApp.exitApp();
        });

        // Démonté pendant l'await : on retire tout de suite l'écouteur.
        if (cancelled) {
          l.remove();
          return;
        }
        backListener = l;
      } catch {
        // Web
      }
    })();

    return () => {
      cancelled = true;
      if (backListener) {
        backListener.remove();
        backListener = null;
      }
    };
  }, []);

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

  const isKeepAliveActive = KEEP_ALIVE_TABS.has(activeTab);

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
      <style>{`@keyframes baaroTabIn{from{opacity:0}to{opacity:1}}.baaro-tab-in{animation:baaroTabIn .18s ease-out}@media (prefers-reduced-motion:reduce){.baaro-tab-in{animation:none}}`}</style>

      {incoming && (
        <Suspense fallback={null}>
          <ChatCallModal mode="incoming" {...incoming} onClose={clearIncoming} />
        </Suspense>
      )}
      <OfflineBanner />

      {(lateReady || forceOnboarding) && (
        <Suspense fallback={null}>
          <OnboardingModal
            forceOpen={forceOnboarding}
            onClose={() => {
              setForceOnboarding(false);
              // Le guide (visite ou IA, au choix) se propose juste après l'introduction.
              import("../features/guide/index.js")
                .then((m) =>
                  window.dispatchEvent(new CustomEvent(m.ONBOARDING_CLOSED_EVENT))
                )
                .catch(() => {});
            }}
          />
        </Suspense>
      )}

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
          notificationCount={unreadNotifications}
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
              unreadMessages={unreadMessages}
            />
          </div>
        )}

        <main
          id="main-content"
          className={isImmersive && !showUi ? "w-full flex-1 flex flex-col" : "col-span-1 md:col-span-3 mobile-nav-spacer"}
          tabIndex={-1}
        >
          <ErrorBoundary>
            {/* Onglets gardés en vie : montés une fois, puis simplement cachés/affichés. */}
            {[...keptRef.current].map((key) => {
              const KeptTab = tabs[key];
              if (!KeptTab) return null;
              return (
                <KeepAliveSlot key={key} active={key === activeTab}>
                  <ErrorBoundary>
                    <Suspense fallback={<TabFallback />}>
                      <KeptTab {...(tabProps[key] || {})} />
                    </Suspense>
                  </ErrorBoundary>
                </KeepAliveSlot>
              );
            })}

            {/* Autres onglets : montés à l'ouverture, démontés à la sortie (comme avant). */}
            {!isKeepAliveActive && Tab ? (
              <Suspense fallback={<TabFallback />}>
                <AnimatedTab tabKey={activeTab}>
                  <Tab
                    key={activeTab}
                    {...(tabProps[activeTab] || {})}
                  />
                </AnimatedTab>
              </Suspense>
            ) : null}

            {Tab && (!isImmersive || showUi) && (
              <FutureModulePanel moduleId={activeTab} onNavigate={(moduleId, action) => {
                if (/IA|intelligent|montage|traduction|mémoire/i.test(action)) setActiveTab("assistant");
                else if (/sécurité|confidentialité|appareils|contrôles|export|privacy/i.test(action)) setActiveTab("settings");
                else if (/communauté|modération/i.test(action)) setActiveTab("community");
                else if (/recherche|historique/i.test(action)) setSearchModalOpen(true);
                else if (/vidéo|Story/i.test(action)) setActiveTab(action.includes("Story") ? "stories" : "videos");
              }} />
            )}
          </ErrorBoundary>

          {/* Espace réservé en bas : le contenu remonte au-dessus de la barre de navigation
              fixe et du bouton flottant de l'assistant (cache sinon les boutons du bas). */}
          {(!isImmersive || showUi) && (
            <div
              className="lg:hidden"
              aria-hidden="true"
              style={{ height: "calc(9rem + env(safe-area-inset-bottom))" }}
            />
          )}
        </main>
      </div>

      {/* NAVIGATION MOBILE (AFFICHÉE SI NON IMMERSIF OU SI SHOWUI EST ACTIF) */}
      {(!isImmersive || showUi) && (
        <div className="md:hidden">
          <Navigation
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            unreadMessages={unreadMessages}
          />
        </div>
      )}

      {/* MODALES ET ASSISTANT (chargés à la demande) */}
      {inspectingProfileId && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {(lateReady || notifDrawerOpen) && (
        <Suspense fallback={null}>
          <NotificationDrawer
            isOpen={notifDrawerOpen}
            onClose={() => setNotifDrawerOpen(false)}
            user_id={id}
          />
        </Suspense>
      )}

      {(lateReady || searchModalOpen) && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {lateReady && (
        <Suspense fallback={null}>
          <GuideHost
            activeTab={activeTab}
            onNavigate={setActiveTab}
            isAnonymous={isAnonymous}
            displayName={userProfile?.display_name}
            suppressed={forceOnboarding || (isImmersive && !showUi)}
          />
        </Suspense>
      )}

      {lateReady && !isAnonymous && (
        <Suspense fallback={null}>
          <FloatingAiAssistant
            userProfile={userProfile}
            hidden={activeTab === "assistant" || activeTab === "videos"}
          />
        </Suspense>
      )}
    </div>
  );
}

export default MainShell;
