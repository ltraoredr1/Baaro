import { useEffect, useState } from "react";
import {
  Coins,
  Radio,
  Shield,
  Phone,
  Mail,
  ArrowLeft,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { TurnstileWidget } from "../../Turnstile.jsx";
import {
  captureRefFromUrl,
  getPendingRef,
} from "../../lib/referralApi.js";
import PhoneAuth from "./PhoneAuth.jsx";
import AccountSuggestions from "./AccountSuggestions.jsx";
import { rememberAccount, savePasswordCredential } from "../../lib/knownAccounts.js";

const LEGAL_VERSION = "2026-10-01";
const FRESH_KEY = "baaro_bio_fresh";

function setFresh() {
  try { sessionStorage.setItem(FRESH_KEY, "1"); } catch {}
}
function clearFresh() {
  try { sessionStorage.removeItem(FRESH_KEY); } catch {}
}

/**
 * Écran d'authentification BAARO — « invité d'abord »
 *  1. Commencer (accès invité, sans inscription)
 *  2. J'ai déjà un compte : Téléphone ou Email (+ mot de passe)
 * Le compte invité peut être sécurisé plus tard depuis Réglages.
 */
export default function AuthScreen() {
  const [mode, setMode] = useState("choice"); // "choice" | "email" | "phone"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [captchaToken, setCaptchaToken] = useState(null);
  const [pendingRef, setPendingRef] = useState(null);

  useEffect(() => {
    captureRefFromUrl();
    setPendingRef(getPendingRef());
  }, []);

  const handlePhoneAuthSuccess = () => {
    setSuccess("Connexion réussie ! Bienvenue sur BAARO.");
  };

  // Enregistre l'acceptation des documents légaux (sans bloquer la connexion)
  const recordConsents = async () => {
    for (const type of ["terms", "privacy", "community"]) {
      try {
        await supabase.rpc("record_legal_consent", {
          p_document_type: type,
          p_version: LEGAL_VERSION,
        });
      } catch (e) {
        console.error("[BAARO] Consentement " + type + ":", e);
      }
    }
  };

  // Connexion anonyme / invité (is_anonymous = true)
  const handleAnonymous = async () => {
    if (loading) return;

    if (!captchaToken) {
      setError("Veuillez valider le test de sécurité ci-dessus.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      try {
        sessionStorage.setItem("baaro_guest_ok", "1");
      } catch {}

      const useCaptcha = captchaToken && captchaToken !== "dev-bypass";

      const { data, error: authError } = await supabase.auth.signInAnonymously(
        useCaptcha ? { options: { captchaToken } } : undefined
      );

      if (authError) {
        try {
          sessionStorage.removeItem("baaro_guest_ok");
        } catch {}
        throw authError;
      }

      if (!data?.session) {
        try {
          sessionStorage.removeItem("baaro_guest_ok");
        } catch {}
        throw new Error("Impossible d'initialiser la session.");
      }

      const id = data?.user?.id;
      if (id) {
        try {
          await supabase.from("profiles").upsert(
            {
              id,
              display_name: "Invité BAARO",
              handle: `@guest_${String(id).replace(/-/g, "").slice(0, 10)}`,
              flag: "🌍",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch (e) {
          console.error("[BAARO] Profil invité:", e);
        }
        await recordConsents();
      }

      setSuccess("Connexion réussie ! Bienvenue sur BAARO.");
    } catch (err) {
      console.error("Erreur connexion anonyme :", err);
      setError(
        err?.message ||
          "Accès invité indisponible. Vérifiez la configuration Supabase."
      );
    } finally {
      setLoading(false);
    }
  };

  // Connexion / Inscription par Email
  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setSuccess(null);

    if (!cleanEmail) {
      setError("Veuillez indiquer une adresse email valide.");
      return;
    }
    if (!password) {
      setError("Veuillez saisir votre mot de passe.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!isLogin && !legalAccepted) {
      setError(
        "Vous devez accepter les conditions d'utilisation et les règles de la communauté."
      );
      return;
    }

    setLoading(true);

    try {
      // Évite que le verrou d'empreinte (web) redemande le doigt juste après le mot de passe
      setFresh();

      // ========== CONNEXION ==========
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (authError) {
          const msg = (authError.message || "").toLowerCase();
          if (
            msg.includes("invalid login credentials") ||
            msg.includes("invalid_credentials")
          ) {
            throw new Error(
              "E-mail ou mot de passe incorrect. Vérifie tes identifiants ou crée un compte."
            );
          }
          if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
            throw new Error(
              "Ton e-mail n’est pas encore confirmé. Regarde ta boîte de réception (et les spams)."
            );
          }
          throw authError;
        }

        if (!data?.session) {
          throw new Error("Session non créée. Réessaie dans quelques secondes.");
        }

        rememberAccount("email", cleanEmail);
        savePasswordCredential(cleanEmail, password);
        setSuccess("Ravi de vous revoir ! Connexion réussie.");
        return;
      }

      // ========== INSCRIPTION ==========
      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (authError) {
        const msg = (authError.message || "").toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("user already") ||
          msg.includes("already been registered")
        ) {
          throw new Error(
            "Cet e-mail est déjà utilisé. Clique sur « Déjà inscrit ? » pour te connecter."
          );
        }
        throw authError;
      }

      const user = data?.user;
      const session = data?.session;

      // Cas 1 : compte déjà existant (Supabase renvoie parfois un user sans session ni identities)
      if (user && (!user.identities || user.identities.length === 0) && !session) {
        throw new Error(
          "Cet e-mail est déjà utilisé. Clique sur « Déjà inscrit ? » pour te connecter."
        );
      }

      // Cas 2 : inscription OK + session immédiate (confirmation e-mail désactivée)
      if (session && user?.id) {
        try {
          await supabase.from("profiles").upsert(
            {
              id: user.id,
              display_name: cleanEmail.split("@")[0] || "Membre BAARO",
              handle: `@user_${String(user.id).replace(/-/g, "").slice(0, 10)}`,
              flag: "🌍",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch (e) {
          console.error("[BAARO] Profil inscription:", e);
        }
        try {
          await recordConsents();
        } catch (e) {
          console.error("[BAARO] Consents:", e);
        }
        rememberAccount("email", cleanEmail);
        savePasswordCredential(cleanEmail, password);
        setSuccess("Votre compte a été créé avec succès !");
        return;
      }

      // Cas 3 : inscription OK mais confirmation e-mail requise
      clearFresh();
      if (user?.id) {
        try {
          await recordConsents();
        } catch (e) {
          console.error("[BAARO] Consents:", e);
        }
        rememberAccount("email", cleanEmail);
        setSuccess(
          "Un e-mail de vérification a été envoyé. Ouvre ta boîte (et les spams), clique sur le lien, puis reconnecte-toi."
        );
        return;
      }

      // Fallback
      setSuccess(
        "Inscription enregistrée. Si tu ne reçois pas d’e-mail, vérifie les spams ou réessaie dans 1 minute."
      );
    } catch (err) {
      clearFresh();
      console.error("Erreur authentification email :", err);
      setError(
        err?.message || "Une erreur s'est produite lors de l'authentification."
      );
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  const toggleAuthMode = () => {
    setIsLogin((prev) => !prev);
    setError(null);
    setSuccess(null);
    setPassword("");
    setLegalAccepted(false);
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      <div className="w-full max-w-md rounded-3xl p-8 border border-amber-500/30 bg-slate-900/90 backdrop-blur-xl shadow-2xl transition-all">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center font-extrabold text-3xl shadow-lg bg-gradient-to-tr from-amber-500 to-teal-400 text-slate-950 tracking-wider">
            B
          </div>
          <h1 className="text-3xl font-black tracking-tight text-amber-400">
            BAARO
          </h1>
          <p className="text-base font-semibold text-slate-200 mt-1">
            Gagne. Échange. Convertis.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            La plateforme d'échange interactive et sécurisée.
          </p>
        </div>

        {/* Arguments clés */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: Coins, label: "Points & Gains", color: "text-amber-400" },
            { icon: Radio, label: "Lives & IA", color: "text-purple-400" },
            { icon: Shield, label: "Sécurisé", color: "text-teal-400" },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-slate-800 bg-slate-950/40 text-center"
            >
              <Icon size={20} className={color} />
              <span className="text-[10px] font-medium text-slate-300">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Referral badge */}
        {pendingRef && (
          <div className="mb-4 text-center text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2">
            Code parrain : <strong>{pendingRef}</strong>
          </div>
        )}

        {/* Messages */}
        {success && (
          <div className="mb-4 text-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* ========== VUE ACCUEIL : INVITÉ D'ABORD ========== */}
        {mode === "choice" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <TurnstileWidget
                onVerify={(token) => {
                  setCaptchaToken(token || null);
                  setError(null);
                  setSuccess(null);
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleAnonymous}
              disabled={loading || !captchaToken}
              className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-teal-400 text-slate-950 shadow-lg disabled:opacity-50 hover:opacity-95 transition-all active:scale-[0.98]"
            >
              <Sparkles size={18} />
              <span>{loading ? "Connexion en cours..." : "Commencer"}</span>
            </button>
            <p className="text-[11px] text-center text-slate-400 -mt-2">
              Sans inscription. Tu pourras sauvegarder ton compte plus tard
              depuis Réglages.
            </p>

            {/* Séparateur */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                J'ai déjà un compte
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => switchMode("phone")}
                className="py-3 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 text-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98]"
              >
                <Phone size={16} />
                <span>Téléphone</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode("email")}
                className="py-3 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 text-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98]"
              >
                <Mail size={16} />
                <span>Email</span>
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-500 leading-relaxed">
              En continuant, tu acceptes les{" "}
              <a href="/terms" className="underline text-amber-400/80">
                conditions
              </a>
              , la{" "}
              <a href="/privacy" className="underline text-amber-400/80">
                confidentialité
              </a>{" "}
              et les{" "}
              <a href="/community-guidelines" className="underline text-amber-400/80">
                règles de la communauté
              </a>
              .
            </p>
          </div>
        )}

        {/* ========== VUE TÉLÉPHONE ========== */}
        {mode === "phone" && (
          <div className="flex flex-col gap-4">
            <PhoneAuth onAuthSuccess={handlePhoneAuthSuccess} />
            <button
              type="button"
              onClick={() => switchMode("choice")}
              className="text-xs text-slate-400 hover:text-slate-200 text-center flex items-center justify-center gap-1 mt-2 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Retour</span>
            </button>
          </div>
        )}

        {/* ========== VUE EMAIL ========== */}
        {mode === "email" && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-100">
                {isLogin ? "Connexion" : "Inscription"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isLogin
                  ? "Entrez vos identifiants pour accéder à votre espace."
                  : "Remplissez les informations ci-dessous pour vous inscrire."}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <input
                  type="email"
                  name="email"
                  placeholder="Adresse email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors text-sm"
                />
                <AccountSuggestions
                  type="email"
                  query={email}
                  onPick={(v) => setEmail(v)}
                />
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors p-1"
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <label className="flex items-start gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(e) => setLegalAccepted(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  J'accepte les{" "}
                  <a
                    href="/terms"
                    className="underline text-amber-400 hover:text-amber-300"
                  >
                    conditions d'utilisation
                  </a>
                  , la{" "}
                  <a
                    href="/privacy"
                    className="underline text-amber-400 hover:text-amber-300"
                  >
                    confidentialité
                  </a>{" "}
                  et les{" "}
                  <a
                    href="/community-guidelines"
                    className="underline text-amber-400 hover:text-amber-300"
                  >
                    règles de la communauté
                  </a>
                  .
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading || (!isLogin && !legalAccepted)}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-teal-400 text-slate-950 shadow-lg disabled:opacity-50 hover:opacity-95 transition-all active:scale-[0.98]"
            >
              {loading
                ? "Traitement..."
                : isLogin
                ? "Se connecter"
                : "S'inscrire"}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <button
                type="button"
                onClick={toggleAuthMode}
                className="hover:text-amber-400 transition-colors underline"
              >
                {isLogin ? "Créer un compte" : "Déjà inscrit ?"}
              </button>
              <button
                type="button"
                onClick={() => switchMode("choice")}
                className="hover:text-slate-200 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={12} />
                <span>Retour</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
