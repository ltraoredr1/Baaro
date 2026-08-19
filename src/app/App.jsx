import { useApp } from "../contexts/AppContext.jsx";
import AuthScreen from "../features/auth/index.js";
import { MainShell } from "./MainShell.jsx";
import { LoadingScreen } from "./TabFallback.jsx";

/**
 * Point d'entrée UI : gate auth uniquement.
 * Le shell et les onglets sont dans MainShell.
 */
export default function App() {
  const { session, loading } = useApp();

  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  return <MainShell />;
}
