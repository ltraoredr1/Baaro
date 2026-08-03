import { useState } from "react";
import { supabase } from "../supabaseClient";
import { TurnstileWidget } from "../Turnstile.jsx";
import { COLORS } from "../theme.js";

export default function AuthScreen() {
  const [mode, setMode] = useState("anonymous"); // "anonymous" | "email"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // "facebook" | "twitter" | null
  const [error, setError] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);

  // Connexion anonyme (flux principal)
  const handleAnonymous = async (token) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const useCaptcha = token && token !== "dev-bypass";
      const { data, error: authError } = await supabase.auth.signInAnonymously(
        useCaptcha ? { options: { captchaToken: token } } : undefined
      );

      if (authError) throw authError;

      // Le reste (création profil + register-device) est géré dans App / useSession
      if (!data?.session) {
        throw new Error("Session non créée");
      }
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          "Impossible de se connecter. Vérifiez que l'auth anonyme est activée dans Supabase."
      );
    } finally {
      setLoading(false);
    }
  };

  // Connexion / inscription email
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: email.split("@")[0],
              handle: `@${email.split("@")[0].slice(0, 20)}`,
            },
          },
        });
        if (authError) throw authError;
      }
    } catch (err) {
      setError(err.message || "Erreur d'authentification");
    } finally {
      setLoading(false);
    }
  };

  // Connexion Facebook / X (OAuth) — redirige vers le fournisseur puis revient sur l'app
  const handleOAuth = async (provider) => {
    if (loading || oauthLoading) return;
    setOauthLoading(provider);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (authError) throw authError;
      // La page redirige vers le fournisseur ; le retour est géré par
      // onAuthStateChange dans App.jsx, rien à faire de plus ici.
    } catch (err) {
      setError(err.message || "Erreur de connexion");
      setOauthLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#0B1220" }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-8 border shadow-2xl"
        style={{
          background: "rgba(15, 23, 42, 0.9)",
          borderColor: COLORS.borderGold || "#D9AE52",
        }}
      >
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🌍</div>
          <h1 className="text-2xl font-bold" style={{ color: COLORS.gold || "#D9AE52" }}>
            BAARO
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.muted || "#94a3b8" }}>
            Réseau social mondial
          </p>
        </div>

        {/* Mode anonyme (principal) */}
        {mode === "anonymous" && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-center" style={{ color: COLORS.ivory || "#f1f5f9" }}>
              Entrez en un clic. Aucun compte requis.
            </p>

            {/* Turnstile */}
            <div className="flex justify-center">
              <TurnstileWidget
                onVerify={(token) => {
                  setCaptchaToken(token);
                  if (token) handleAnonymous(token);
                }}
              />
            </div>

            {loading && (
              <div className="text-center text-sm" style={{ color: COLORS.muted }}>
                Connexion en cours...
              </div>
            )}

            {error && (
              <div className="text-center text-sm text-rose-400 bg-rose-500/10 rounded-xl p-3">
                {error}
              </div>
            )}

            {/* Séparateur */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: COLORS.border || "#334155" }} />
              <span className="text-xs" style={{ color: COLORS.muted || "#94a3b8" }}>
                ou
              </span>
              <div className="flex-1 h-px" style={{ background: COLORS.border || "#334155" }} />
            </div>

            {/* Boutons OAuth */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleOAuth("facebook")}
                disabled={!!oauthLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "#1877F2", color: "#fff" }}
              >
                {oauthLoading === "facebook" ? "Connexion..." : "Continuer avec Facebook"}
              </button>

              <button
                type="button"
                onClick={() => handleOAuth("twitter")}
                disabled={!!oauthLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "#000000", color: "#fff", border: "1px solid #334155" }}
              >
                {oauthLoading === "twitter" ? "Connexion..." : "Continuer avec X"}
              </button>
            </div>

            <button
              onClick={() => setMode("email")}
              className="text-sm text-center underline"
              style={{ color: COLORS.teal || "#2DBFA6" }}
            >
              Ou se connecter avec un email
            </button>
          </div>
        )}

        {/* Mode email */}
        {mode === "email" && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm"
              style={{
                borderColor: COLORS.border || "#334155",
                color: COLORS.ivory || "#f1f5f9",
              }}
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm"
              style={{
                borderColor: COLORS.border || "#334155",
                color: COLORS.ivory || "#f1f5f9",
              }}
            />

            {error && (
              <div className="text-center text-sm text-rose-400 bg-rose-500/10 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
                color: "#0B1220",
              }}
            >
              {loading
                ? "Chargement..."
                : isLogin
                ? "Se connecter"
                : "Créer un compte"}
            </button>

            <div className="flex justify-between text-xs" style={{ color: COLORS.muted }}>
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="underline"
              >
                {isLogin ? "Créer un compte" : "Déjà un compte ?"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("anonymous");
                  setError(null);
                }}
                className="underline"
              >
                Retour
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
