import { useEffect, Suspense, lazy } from "react";
import { Routes, Route, useNavigate, useParams, Navigate } from "react-router-dom";
import { useApp } from "../contexts/AppContext.jsx";
import { LoadingScreen } from "./TabFallback.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { callSocial } from "../lib/notifyInteraction.js";
import { useSettings } from "../hooks/useSettings.js";
import { usePushNotifications } from "../hooks/usePushNotifications.js";
import { applyNativeSettings } from "../lib/nativeSettings.js";
import { unlockAudio } from "../lib/callRingtone.js";

// ---------------------------------------------------------------
// Chargement à la demande : le bundle de démarrage ne contient plus
// que l'authentification, le routeur et le contexte.
// ---------------------------------------------------------------
const loadMainShell = () =>
  import("./MainShell.jsx").then((m) => ({ default: m.MainShell }));
const MainShell = lazy(loadMainShell);
// Téléchargement lancé tout de suite, EN PARALLÈLE de la vérification de session
// (la plupart des ouvertures sont des utilisateurs déjà connectés).
loadMainShell();

const AuthScreen = lazy(() => import("../features/auth/index.js"));
const BiometricGate = lazy(() => import("../features/auth/BiometricGate.jsx"));
const InvitePage = lazy(() => import("../pages/InvitePage.jsx"));
const PrivacyPage = lazy(() =>
  import("../components/PrivacyPage.jsx").then((m) => ({ default: m.PrivacyPage }))
);
const LegalPage = lazy(() =>
  import("../components/LegalPage.jsx").then((m) => ({ default: m.LegalPage }))
);
const AdminSchemaGuard = lazy(() => import("../pages/AdminSchemaGuard.jsx"));

function InviteRouteGate() {
  const { code } = useParams();
  const { user, loading } = useApp();

  useEffect(() => {
    if (!code || loading) return;
    if (!user?.id) {
      try { localStorage.setItem("pending_invite_code", code); } catch {}
    }
  }, [code, user?.id, loading]);

  if (loading) return <LoadingScreen />;
  return (
    <ErrorBoundary>
      <InvitePage />
    </ErrorBoundary>
  );
}

function PrivacyRoute() {
  const navigate = useNavigate();
  return <PrivacyPage onBack={() => navigate(-1)} />;
}

function LegalRoute({ type }) {
  const navigate = useNavigate();
  return <LegalPage type={type} onBack={() => navigate(-1)} />;
}

function AdminSchemaRoute() {
  return (
    <AdminSchemaGuard>
      <div className="min-h-screen bg-black p-6 text-white">
        <h1 className="text-xl font-bold">Administration du schéma</h1>
        <p className="mt-2 text-sm text-white/60">Accès administrateur vérifié.</p>
      </div>
    </AdminSchemaGuard>
  );
}

function AppShell() {
  const { user, isGuest, loading } = useApp();
  const navigate = useNavigate();

  // Activation/synchronisation push pour tout le cycle de vie de l'application.
  // Les invités restent exclus afin de ne pas enregistrer de jeton anonyme.
  usePushNotifications(user?.id && !isGuest ? user.id : null);

  // 1. Invite en attente après login
  useEffect(() => {
    if (loading || !user?.id) return;
    try {
      const pending = localStorage.getItem("pending_invite_code");
      if (pending) {
        localStorage.removeItem("pending_invite_code");
        navigate(`/invite/${pending}`, { replace: true });
      }
    } catch {}
  }, [user?.id, loading, navigate]);

  // 2. Deep link natif - SAFE sur web
  useEffect(() => {
    let listener;
    let cancelled = false;
    const setup = async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        if (cancelled) return;
        const l = await CapApp.addListener("appUrlOpen", (event) => {
          try {
            const url = new URL(event.url);
            let code = null;
            if (url.pathname.startsWith("/invite/")) {
              code = url.pathname.split("/").pop();
            } else if (url.host === "invite") {
              code = url.pathname.slice(1);
            }
            if (code) navigate(`/invite/${code}`, { replace: true });
          } catch {}
        });
        if (cancelled) {
          l.remove();
          return;
        }
        listener = l;
      } catch {}
    };
    setup();
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [navigate]);

  // 3. Stories programmées
  // Premier passage retardé de 5 s : il ne concurrence plus le chargement initial.
  useEffect(() => {
    if (loading || !user?.id || user.is_anonymous === true) return;
    const sweep = () => {
      if (document.visibilityState === "hidden") return;
      callSocial("publish_due").catch(() => {});
    };
    const first = setTimeout(sweep, 5000);
    const timer = setInterval(sweep, 60_000);
    document.addEventListener("visibilitychange", sweep);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sweep);
    };
  }, [user?.id, user?.is_anonymous, loading]);

  // 4. Débloquer Web Audio au premier geste (sonneries / sons in-app)
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
  }, []);

  if (loading) return <LoadingScreen />;

  const isRealUser = Boolean(user?.id && user.is_anonymous !== true);
  const isAllowedGuest = Boolean(isGuest || user?.is_anonymous);

  if (!isRealUser && !isAllowedGuest) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AuthScreen />
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <BiometricGate>
          <MainShell />
        </BiometricGate>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const { settings } = useSettings();

  useEffect(() => {
    void applyNativeSettings(settings).catch((e) =>
      console.warn("[app] native settings:", e)
    );
  }, [settings.block_screenshots, settings.biometric]);

  // Capgo : notifyAppReady() est déjà appelé dans main.jsx (une seule fois).

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/invite/:code" element={<InviteRouteGate />} />
          <Route path="/privacy" element={<PrivacyRoute />} />
          <Route path="/terms" element={<LegalRoute type="terms" />} />
          <Route path="/community-guidelines" element={<LegalRoute type="community" />} />
          <Route path="/refund-policy" element={<LegalRoute type="refund" />} />
          <Route path="/creator-terms" element={<LegalRoute type="creator" />} />
          <Route path="/merchant-terms" element={<LegalRoute type="merchant" />} />
          <Route path="/cookies" element={<LegalRoute type="cookies" />} />
          <Route path="/admin/schema" element={<AdminSchemaRoute />} />
          <Route path="/*" element={<AppShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
