import { useEffect } from "react";
import { Routes, Route, useNavigate, useParams, Navigate } from "react-router-dom";
import { useApp } from "../contexts/AppContext.jsx";
import AuthScreen from "../features/auth/index.js";
import { MainShell } from "./MainShell.jsx";
import { LoadingScreen } from "./TabFallback.jsx";
import InvitePage from "../pages/InvitePage.jsx";
import { PrivacyPage } from "../components/PrivacyPage.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";

function InviteRouteGate() {
  const { code } = useParams();
  const { user, loading } = useApp();

  useEffect(() => {
    if (!code || loading) return;
    // Si pas connecté, on garde le code pour après login
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

function AppShell() {
  const { user, isGuest, loading } = useApp();
  const navigate = useNavigate();

  // 1. Invite en attente après login
  useEffect(() => {
    if (loading ||!user?.id) return;
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
        // Dynamic import pour ne pas crasher sur web
        const { App: CapApp } = await import('@capacitor/app');
        if (cancelled) return;
        const l = await CapApp.addListener('appUrlOpen', (event) => {
          try {
            const url = new URL(event.url);
            let code = null;
            if (url.pathname.startsWith('/invite/')) {
              code = url.pathname.split('/').pop();
            } else if (url.host === 'invite') {
              code = url.pathname.slice(1);
            }
            if (code) navigate(`/invite/${code}`, { replace: true });
          } catch {}
        });
        listener = l;
      } catch {
        // Pas sur mobile natif, on ignore
      }
    };
    setup();

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [navigate]);

  if (loading) return <LoadingScreen />;

  // Auth simple et unique : plus de guestOk en sessionStorage
  const isRealUser = Boolean(user?.id && user.is_anonymous!== true);
  const isAllowedGuest = Boolean(isGuest || user?.is_anonymous);

  if (!isRealUser &&!isAllowedGuest) {
    return <AuthScreen />;
  }

  return (
    <ErrorBoundary>
      <MainShell />
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/invite/:code" element={<InviteRouteGate />} />
        <Route path="/privacy" element={<PrivacyRoute />} />
        <Route path="/*" element={<AppShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
