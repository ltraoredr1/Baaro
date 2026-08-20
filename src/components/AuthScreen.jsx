import { useState, useEffect } from "react";
import { Coins, Radio, Shield, Sparkles } from "lucide-react";
import { supabase } from "../supabaseClient";
import { TurnstileWidget } from "../Turnstile.jsx";
import { COLORS } from "../theme.js";
import { captureRefFromUrl, getPendingRef } from "../lib/referralApi.js";

/**
 * Écran d'entrée BAARO — promesse de valeur en < 8 secondes.
 * Remplace : src/components/AuthScreen.jsx
 * (réexporté par src/features/auth/index.js)
 */
export default function AuthScreen() {
  const [mode, setMode] = useState("anonymous"); // "anonymous" | "email"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [error, setError] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [pendingRef, setPendingRef] = useState(null);

  useEffect(() => {
    captureRefFromUrl();
    setPendingRef(getPendingRef());
  }, []);

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
      if (!data?.session) throw new Error("Session non créée");
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
          background: "rgba(15, 23, 42, 0.95)",
          borderColor: COLORS.borderGold || "#D9AE52",
        }}
      >
        {/* ——— Promesse de valeur (0–8 s) ——— */}
        <div className="text-center mb-6">
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
              fontFamily: "'Fraunces', serif",
            }}
          >
            B
          </div>
          <h1
            className="text-2xl font-bold tracking-wide"
            style={{ color: COLORS.gold || "#D9AE52" }}
          >
            BAARO
          </h1>
          <p
            className="text-base font-semibold mt-1.5"
            style={{ color: COLORS.ivory || "#f1f5f9" }}
          >
            Gagne. Échange. Convertis.
          </p>
          <p
            className="text-sm mt-2 leading-relaxed px-1"
            style={{ color: COLORS.muted || "#94a3b8" }}
          >
            Chaque action te rapporte des points convertibles en{" "}
            <span style={{ color: COLORS.teal }}>BARO Coin</span> ou en
            récompenses.
          </p>
        </div>

        {/* 3 piliers micro */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: Coins, label: "Points → valeur", color: COLORS.gold },
            { icon: Radio, label: "Lives + IA", color: COLORS.purple },
            { icon: Shield, label: "Chat chiffré", color: COLORS.teal },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Icon size={18} style={{ color }} />
              <span
                className="text-[10px] font-medium leading-tight"
                style={{ color: COLORS.muted }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {pendingRef && (
          <div
            className="mb-5 p-3 rounded-xl text-xs text-center border"
            style={{
              background: "rgba(45,191,166,0.1)",
              borderColor: COLORS.borderTeal,
              color: COLORS.teal,
            }}
          >
            Code parrain détecté :{" "}
            <strong className="font-mono">{pendingRef}</strong>
            <br />
            Il sera appliqué après création d&apos;un compte (email ou réseau
            social).
          </div>
        )}

        {mode === "anonymous" && (
          <div className="flex flex-col gap-5">
            <p
              className="text-sm text-center font-medium"
              style={{ color: COLORS.ivory || "#f1f5f9" }}
            >
              Entre gratuitement — aucun compte requis.
            </p>

            <div className="flex justify-center">
              <TurnstileWidget
                onVerify={(token) => {
                  setCaptchaToken(token);
                  if (token) handleAnonymous(token);
                }}
              />
            </div>

            {loading && (
              <div
                className="text-center text-sm flex items-center justify-center gap-2"
                style={{ color: COLORS.muted }}
              >
                <Sparkles size={14} style={{ color: COLORS.gold }} />
                Connexion en cours...
              </div>
            )}

            {error && (
              <div className="text-center text-sm text-rose-400 bg-rose-500/10 rounded-xl p-3">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-px"
                style={{ background: COLORS.border || "#334155" }}
              />
              <span
                className="text-xs"
                style={{ color: COLORS.muted || "#94a3b8" }}
              >
                ou
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: COLORS.border || "#334155" }}
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleOAuth("facebook")}
                disabled={!!oauthLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                style={{ background: "#1877F2", color: "#fff" }}
              >
                {oauthLoading === "facebook"
                  ? "Connexion..."
                  : "Continuer avec Facebook"}
              </button>

              <button
                type="button"
                onClick={() => handleOAuth("twitter")}
                disabled={!!oauthLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                style={{
                  background: "#000000",
                  color: "#fff",
                  border: "1px solid #334155",
                }}
              >
                {oauthLoading === "twitter"
                  ? "Connexion..."
                  : "Continuer avec X"}
              </button>
            </div>

            <button
              onClick={() => setMode("email")}
              className="text-sm text-center underline"
              style={{ color: COLORS.teal || "#2DBFA6" }}
            >
              Ou se connecter avec un email
            </button>

            <p
              className="text-[10px] text-center leading-relaxed"
              style={{ color: COLORS.muted }}
            >
              En invité tu explores librement. Crée un compte pour gagner des
              points et les convertir.
            </p>
          </div>
        )}

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

            <div
              className="flex justify-between text-xs"
              style={{ color: COLORS.muted }}
            >
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
