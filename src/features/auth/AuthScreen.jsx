import { useEffect, useState } from "react";
import {
  Coins,
  Radio,
  Shield,
  Phone,
  Mail,
  Send,
  ArrowLeft,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { TurnstileWidget } from "../../Turnstile.jsx";
import { COLORS } from "../../theme.js";
import {
  captureRefFromUrl,
  getPendingRef,
} from "../../lib/referralApi.js";
import PhoneAuth from "./PhoneAuth.jsx"; // ✅ Importation corrigée (même dossier)

export default function AuthScreen() {
  const [mode, setMode] = useState("choice"); // "choice", "guest", "email", "phone"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [captchaToken, setCaptchaToken] = useState(null);
  const [pendingRef, setPendingRef] = useState(null);

  useEffect(() => {
    captureRefFromUrl();
    setPendingRef(getPendingRef());
  }, []);

  /**
   * Connexion anonyme / invité.
   */
  const handleAnonymous = async () => {
    if (loading) return;

    if (!captchaToken) {
      setError("Veuillez valider le test de sécurité ci-dessous.");
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
        useCaptcha
          ? {
              options: {
                captchaToken,
              },
            }
          : undefined
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

      // Identifiant unique = auth.users.id
      const id = data?.user?.id;
      if (id) {
        try {
          await supabase.from("profiles").upsert(
            {
              id,
              display_name: "Membre BAARO",
              handle: `@user_${String(id).replace(/-/g, "").slice(0, 10)}`,
              flag: "🌍",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch (e) {
          console.error("[BAARO] Profil invité:", e);
        }
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

  /**
   * Connexion / Inscription par Email.
   */
  const handleEmailSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim();

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

    setLoading(true);

    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (authError) throw authError;

        setSuccess("Ravi de vous revoir ! Connexion réussie.");
        return;
      }

      /* INSCRIPTION : Authentification utilisant uniquement la clé unique `id` */
      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (authError) throw authError;

      // Identifiant unique = auth.users.id
      const id = data?.user?.id;

      if (data?.session && id) {
        try {
          await supabase.from("profiles").upsert(
            {
              id,
              display_name: cleanEmail.split("@")[0] || "Membre BAARO",
              handle: `@user_${String(id).replace(/-/g, "").slice(0, 10)}`,
              flag: "🌍",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch (e) {
          console.error("[BAARO] Profil inscription:", e);
        }
        setSuccess("Votre compte a été créé avec succès !");
        return;
      }

      setSuccess(
        "Un email de vérification vous a été envoyé. Veuillez consulter votre boîte de réception pour valider votre compte."
      );
    } catch (err) {
      console.error("Erreur authentification email :", err);
      setError(err?.message || "Une erreur s'est produite lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connexion via fournisseurs réseaux sociaux (OAuth).
   */
  const handleOAuth = async (provider) => {
    if (loading || oauthLoading) return;

    setOauthLoading(provider);
    setError(null);
    setSuccess(null);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;
    } catch (err) {
      console.error(`Erreur OAuth ${provider} :`, err);
      setError(err?.message || "Erreur lors de la connexion externe.");
      setOauthLoading(null);
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
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      <div className="w-full max-w-md rounded-3xl p-8 border border-amber-500/30 bg-slate-900/90 backdrop-blur-xl shadow-2xl transition-all">
        {/* En-tête / Branding */}
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
              <span className="text-[11px] font-medium text-slate-400">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Code de Parrainage */}
        {pendingRef && (
          <div className="mb-6 p-3 rounded-xl text-xs text-center border border-teal-500/30 bg-teal-500/10 text-teal-300 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />
            <span>
              Code parrain appliqué : <strong className="font-mono text-teal-200">{pendingRef}</strong>
            </span>
          </div>
        )}

        {/* =====================================================
            VUE 1 : CHOIX PRINCIPAL DES MÉTHODES
        ====================================================== */}
        {mode === "choice" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-center uppercase tracking-wider font-semibold text-slate-400 mb-2">
              Choisissez votre mode d'accès
            </p>

            {/* Téléphone */}
            <button
              type="button"
              onClick={() => switchMode("phone")}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all active:scale-[0.98]"
            >
              <Phone size={18} />
              <span>Continuer avec Téléphone</span>
            </button>

            {/* Email */}
            <button
              type="button"
              onClick={() => switchMode("email")}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all active:scale-[0.98]"
            >
              <Mail size={18} />
              <span>Continuer avec Email</span>
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => handleOAuth("facebook")}
              disabled={!!oauthLoading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span className="font-bold text-lg leading-none">f</span>
              <span>
                {oauthLoading === "facebook" ? "Connexion..." : "Continuer avec Facebook"}
              </span>
            </button>

            {/* Telegram */}
            <button
              type="button"
              onClick={() => handleOAuth("telegram")}
              disabled={!!oauthLoading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-[#229ED9] hover:bg-[#1f92c9] text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Send size={18} />
              <span>
                {oauthLoading === "telegram" ? "Connexion..." : "Continuer avec Telegram"}
              </span>
            </button>

            {/* X / Twitter */}
            <button
              type="button"
              onClick={() => handleOAuth("twitter")}
              disabled={!!oauthLoading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-slate-950 hover:bg-black text-white border border-slate-800 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span className="font-bold text-base">X</span>
              <span>
                {oauthLoading === "twitter" ? "Connexion..." : "Continuer avec X"}
              </span>
            </button>

            {/* Séparateur */}
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                ou
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Bouton Accès Invité autonome */}
            <button
              type="button"
              onClick={() => switchMode("guest")}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-all active:scale-[0.98]"
            >
              <UserCheck size={18} />
              <span>Accès Invité (Découverte)</span>
            </button>
          </div>
        )}

        {/* =====================================================
            VUE 2 : MODE INVITÉ
        ====================================================== */}
        {mode === "guest" && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-100">
                Accès Invité
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Validez le contrôle de sécurité ci-dessous pour continuer.
              </p>
            </div>

            {/* CAPTCHA Widget */}
            <div className="flex justify-center my-2">
              <TurnstileWidget
                onVerify={(token) => {
                  setCaptchaToken(token || null);
                  setError(null);
                  setSuccess(null);
                }}
              />
            </div>

            {/* Notifications */}
            {success && (
              <div className="text-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                {success}
              </div>
            )}
            {error && (
              <div className="text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleAnonymous}
              disabled={loading || !captchaToken}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-teal-400 text-slate-950 shadow-lg disabled:opacity-50 hover:opacity-95 transition-all active:scale-[0.98]"
            >
              {loading ? "Connexion en cours..." : "Entrer en tant qu'invité"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("choice")}
              className="text-xs text-slate-400 hover:text-slate-200 text-center flex items-center justify-center gap-1 mt-2 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Retour aux choix de connexion</span>
            </button>
          </div>
        )}

        {/* =====================================================
            VUE 3 : MODE TÉLÉPHONE
        ====================================================== */}
        {mode === "phone" && (
          <div className="flex flex-col gap-4">
            <PhoneAuth />

            <button
              type="button"
              onClick={() => switchMode("choice")}
              className="text-xs text-slate-400 hover:text-slate-200 text-center flex items-center justify-center gap-1 mt-2 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Retour aux choix de connexion</span>
            </button>
          </div>
        )}

        {/* =====================================================
            VUE 4 : MODE EMAIL
        ====================================================== */}
        {mode === "email" && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-100">
                {isLogin ? "Connexion" : "Créer un compte"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isLogin
                  ? "Entrez vos identifiants pour accéder à votre espace."
                  : "Remplissez les informations ci-dessous pour vous inscrire."}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Adresse email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors text-sm"
              />

              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors text-sm"
              />
            </div>

            {/* Notifications */}
            {success && (
              <div className="text-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                {success}
              </div>
            )}
            {error && (
              <div className="text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
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
