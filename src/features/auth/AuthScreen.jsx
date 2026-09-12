import { useEffect, useState } from "react";
import { Coins, Radio, Shield, Sparkles, Mail, Phone, Facebook, X } from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { TurnstileWidget } from "../../Turnstile.jsx";
import { COLORS } from "../../theme.js";
import { captureRefFromUrl, getPendingRef } from "../../lib/referralApi.js";

/**
 * Authentification BAARO : invité, email/mot de passe, téléphone OTP et OAuth.
 * OAuth attend les providers activés dans Supabase (facebook, twitter/X, google).
 */
export default function AuthScreen() {
  const [mode, setMode] = useState("anonymous"); // anonymous | email | phone
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStep, setPhoneStep] = useState("request");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [pendingRef, setPendingRef] = useState(null);

  useEffect(() => {
    captureRefFromUrl();
    setPendingRef(getPendingRef());
  }, []);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleAnonymous = async (token) => {
    if (loading) return;
    setLoading(true);
    resetMessages();
    try {
      const useCaptcha = token && token !== "dev-bypass";
      const { data, error: authError } = await supabase.auth.signInAnonymously(
        useCaptcha ? { options: { captchaToken: token } } : undefined
      );
      if (authError) throw authError;
      if (!data?.session) throw new Error("Session non créée");
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible de se connecter en invité.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    resetMessages();
    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: email.trim().split("@")[0],
              handle: `@${email.trim().split("@")[0].slice(0, 20)}`,
            },
          },
        });
        if (authError) throw authError;
        if (data?.user && !data?.session) {
          setNotice("Compte créé. Vérifiez votre e-mail pour confirmer votre adresse avant de vous connecter.");
        }
      }
    } catch (err) {
      setError(err.message || "Erreur d'authentification par e-mail.");
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (value) => value.replace(/[\s().-]/g, "");

  const requestPhoneCode = async (e) => {
    e?.preventDefault();
    if (loading) return;
    const normalized = normalizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError("Entrez un numéro international valide, par exemple +223XXXXXXXX.");
      return;
    }

    setLoading(true);
    resetMessages();
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: { shouldCreateUser: true },
      });
      if (authError) throw authError;
      setPhone(normalized);
      setPhoneStep("verify");
      setNotice("Code envoyé par SMS. Saisissez-le pour créer ou ouvrir votre compte BAARO.");
    } catch (err) {
      setError(err.message || "Impossible d'envoyer le code SMS.");
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneCode = async (e) => {
    e?.preventDefault();
    if (loading) return;
    if (!/^\d{4,8}$/.test(phoneCode.trim())) {
      setError("Entrez le code reçu par SMS.");
      return;
    }
    setLoading(true);
    resetMessages();
    try {
      const { data, error: authError } = await supabase.auth.verifyOtp({
        phone,
        token: phoneCode.trim(),
        type: "sms",
      });
      if (authError) throw authError;
      if (!data?.session) throw new Error("Session non créée après vérification du numéro.");
    } catch (err) {
      setError(err.message || "Code SMS invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    if (loading || oauthLoading) return;
    setOauthLoading(provider);
    resetMessages();
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err.message || `Connexion ${provider} impossible.`);
      setOauthLoading(null);
    }
  };

  const inputStyle = {
    borderColor: COLORS.border || "#334155",
    color: COLORS.ivory || "#f1f5f9",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0B1220" }}>
      <div
        className="w-full max-w-md rounded-3xl p-8 border shadow-2xl"
        style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: COLORS.borderGold || "#D9AE52" }}
      >
        <div className="text-center mb-6">
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg"
            style={{ background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: COLORS.bg }}
          >
            B
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: COLORS.gold || "#D9AE52" }}>BAARO</h1>
          <p className="text-base font-semibold mt-1.5" style={{ color: COLORS.ivory || "#f1f5f9" }}>Gagne. Échange. Convertis.</p>
          <p className="text-sm mt-2 leading-relaxed px-1" style={{ color: COLORS.muted || "#94a3b8" }}>
            Crée ton compte avec ton e-mail, ton numéro ou un réseau social.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: Coins, label: "Points → valeur", color: COLORS.gold },
            { icon: Radio, label: "Lives + IA", color: COLORS.purple },
            { icon: Shield, label: "Compte sécurisé", color: COLORS.teal },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
              <Icon size={18} style={{ color }} />
              <span className="text-[10px] font-medium leading-tight" style={{ color: COLORS.muted }}>{label}</span>
            </div>
          ))}
        </div>

        {pendingRef && (
          <div className="mb-5 p-3 rounded-xl text-xs text-center border" style={{ background: "rgba(45,191,166,0.1)", borderColor: COLORS.borderTeal, color: COLORS.teal }}>
            Code parrain détecté : <strong className="font-mono">{pendingRef}</strong>
            <br />Il sera appliqué après création du compte.
          </div>
        )}

        {mode === "anonymous" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <TurnstileWidget onVerify={(token) => { setCaptchaToken(token); if (token) handleAnonymous(token); }} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: COLORS.border || "#334155" }} />
              <span className="text-xs" style={{ color: COLORS.muted }}>Créer / se connecter</span>
              <div className="flex-1 h-px" style={{ background: COLORS.border || "#334155" }} />
            </div>

            <button type="button" onClick={() => { setMode("email"); resetMessages(); }} className="w-full py-3 rounded-xl font-semibold text-sm border flex items-center justify-center gap-2" style={inputStyle}>
              <Mail size={17} /> E-mail et mot de passe
            </button>
            <button type="button" onClick={() => { setMode("phone"); setPhoneStep("request"); resetMessages(); }} className="w-full py-3 rounded-xl font-semibold text-sm border flex items-center justify-center gap-2" style={inputStyle}>
              <Phone size={17} /> Numéro de téléphone (SMS)
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => handleOAuth("facebook")} disabled={!!oauthLoading} className="py-3 rounded-xl font-semibold text-xs disabled:opacity-50" style={{ background: "#1877F2", color: "#fff" }}>
                <Facebook size={16} className="mx-auto mb-1" /> Facebook
              </button>
              <button type="button" onClick={() => handleOAuth("twitter")} disabled={!!oauthLoading} className="py-3 rounded-xl font-semibold text-xs disabled:opacity-50" style={{ background: "#000", color: "#fff", border: "1px solid #334155" }}>
                <X size={16} className="mx-auto mb-1" /> X
              </button>
              <button type="button" onClick={() => handleOAuth("google")} disabled={!!oauthLoading} className="py-3 rounded-xl font-semibold text-xs disabled:opacity-50" style={{ background: "#fff", color: "#111827" }}>
                <span className="text-base font-bold block mb-0.5">G</span> Google
              </button>
            </div>

            {oauthLoading && <div className="text-center text-xs" style={{ color: COLORS.muted }}>Redirection vers {oauthLoading}...</div>}
            <p className="text-[10px] text-center leading-relaxed" style={{ color: COLORS.muted }}>
              Les réseaux sociaux créent automatiquement ton compte BAARO lors de la première connexion.
            </p>
          </div>
        )}

        {mode === "email" && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="flex rounded-xl border p-1" style={{ borderColor: COLORS.border || "#334155" }}>
              <button type="button" onClick={() => { setIsLogin(true); resetMessages(); }} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: isLogin ? "rgba(217,174,82,.15)" : "transparent", color: isLogin ? COLORS.gold : COLORS.muted }}>Connexion</button>
              <button type="button" onClick={() => { setIsLogin(false); resetMessages(); }} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: !isLogin ? "rgba(45,191,166,.15)" : "transparent", color: !isLogin ? COLORS.teal : COLORS.muted }}>Inscription</button>
            </div>
            <input type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm" style={inputStyle} />
            <input type="password" placeholder="Mot de passe (6 caractères minimum)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm" style={inputStyle} />
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50" style={{ background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: "#0B1220" }}>
              {loading ? "Chargement..." : isLogin ? "Se connecter" : "Créer mon compte"}
            </button>
            <button type="button" onClick={() => { setMode("anonymous"); resetMessages(); }} className="text-sm underline" style={{ color: COLORS.muted }}>Retour</button>
          </form>
        )}

        {mode === "phone" && (
          <form onSubmit={phoneStep === "request" ? requestPhoneCode : verifyPhoneCode} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.ivory }}><Phone size={18} style={{ color: COLORS.teal }} /> Compte par numéro</div>
            <p className="text-xs leading-relaxed" style={{ color: COLORS.muted }}>Utilisez le format international, par exemple +223XXXXXXXX. Un code de vérification sera envoyé par SMS.</p>
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+223XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={phoneStep === "verify"} required className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm" style={inputStyle} />
            {phoneStep === "verify" && <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Code reçu par SMS" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 8))} required className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm tracking-[0.35em] text-center" style={inputStyle} />}
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50" style={{ background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: "#0B1220" }}>
              {loading ? "Vérification..." : phoneStep === "request" ? "Envoyer le code SMS" : "Vérifier et créer le compte"}
            </button>
            {phoneStep === "verify" && <button type="button" onClick={() => { setPhoneStep("request"); setPhoneCode(""); resetMessages(); }} className="text-xs underline" style={{ color: COLORS.muted }}>Modifier le numéro / renvoyer un code</button>}
            <button type="button" onClick={() => { setMode("anonymous"); setPhoneStep("request"); resetMessages(); }} className="text-sm underline" style={{ color: COLORS.muted }}>Retour</button>
          </form>
        )}

        {notice && <div className="mt-4 text-center text-sm rounded-xl p-3" style={{ color: COLORS.teal, background: "rgba(45,191,166,.1)" }}>{notice}</div>}
        {error && <div className="mt-4 text-center text-sm text-rose-400 bg-rose-500/10 rounded-xl p-3">{error}</div>}
      </div>
    </div>
  );
}
