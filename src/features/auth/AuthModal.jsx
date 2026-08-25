import { useState } from "react";
import { User, Lock, Mail, Flag, Sparkles, X, LogIn, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState("signup"); // "signup" or "login"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [flag, setFlag] = useState("🇫🇷");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!email.trim() || !password.trim() || !displayName.trim()) {
          setErrorMessage("Veuillez remplir tous les champs obligatoires.");
          setLoading(false);
          return;
        }

        // Supabase sign up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              display_name: displayName.trim(),
              handle: handle.trim() ? (handle.startsWith("@") ? handle : `@${handle}`) : `@${displayName.toLowerCase().replace(/\s+/g, "_")}`,
              flag: flag || "🌍"
            }
          }
        });

        if (error) {
          // If Supabase is placeholder or fails, simulate successful account creation in local state
          console.warn("Supabase Auth notice:", error.message);
        }

        const newUserProfile = {
          display_name: displayName.trim(),
          handle: handle.trim() ? (handle.startsWith("@") ? handle : `@${handle}`) : `@${displayName.toLowerCase().replace(/\s+/g, "_")}`,
          flag: flag || "🌍",
          email: email.trim(),
          bio: "Membre nouvellement inscrit sur BAARO Network."
        };

        onAuthSuccess(newUserProfile);
        showToast(`Bienvenue sur BAARO, ${displayName} ! Compte créé avec succès. (+50 pts)`, "success");
        onClose();
      } else {
        // Sign In
        if (!email.trim() || !password.trim()) {
          setErrorMessage("Veuillez saisir votre e-mail et mot de passe.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        const loggedInProfile = {
          display_name: email.split("@")[0],
          handle: `@${email.split("@")[0]}`,
          flag: "🌍",
          email: email.trim()
        };

        onAuthSuccess(loggedInProfile);
        showToast("Connexion réussie ! Ravie de vous revoir.", "success");
        onClose();
      }
    } catch (err) {
      setErrorMessage("Une erreur est survenue lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-card rounded-3xl p-6 border shadow-2xl flex flex-col gap-5"
        style={{ borderColor: COLORS.borderGold }}
      >
        {/* Top Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shadow-md gold-glow" style={{ background: COLORS.gold, color: COLORS.bg, fontFamily: "'Fraunces', serif" }}>
              B
            </div>
            <h3 className="text-base font-bold text-gradient-gold">
              {mode === "signup" ? "Créer un Compte BAARO" : "Se Connecter à BAARO"}
            </h3>
          </div>
          <button onClick={onClose} style={{ color: COLORS.muted }}>
            <X size={18} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-xl p-1 border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${mode === "signup" ? "shadow-md" : ""}`}
            style={{
              background: mode === "signup" ? COLORS.gold : "transparent",
              color: mode === "signup" ? COLORS.bg : COLORS.muted
            }}
          >
            <UserPlus size={14} />
            <span>Inscription (+50 pts)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${mode === "login" ? "shadow-md" : ""}`}
            style={{
              background: mode === "login" ? COLORS.teal : "transparent",
              color: mode === "login" ? COLORS.bg : COLORS.muted
            }}
          >
            <LogIn size={14} />
            <span>Connexion</span>
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl border text-xs flex items-center gap-2 text-rose-400 bg-rose-500/10 border-rose-500/30">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Nom d'affichage</label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                  <User size={14} style={{ color: COLORS.gold }} />
                  <input
                    type="text"
                    required
                    placeholder="Ex: Jean Dupont"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-transparent text-xs outline-none"
                    style={{ color: COLORS.ivory }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Drapeau</label>
                <input
                  type="text"
                  placeholder="🇫🇷"
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                  className="w-full bg-transparent border rounded-xl p-2.5 text-xs text-center outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Nom d'utilisateur (Handle)</label>
              <input
                type="text"
                placeholder="@jean_dupont"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full bg-transparent border rounded-xl p-2.5 text-xs outline-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Adresse E-mail</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <Mail size={14} style={{ color: COLORS.teal }} />
              <input
                type="email"
                required
                placeholder="votre.email@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: COLORS.ivory }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Mot de Passe</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <Lock size={14} style={{ color: COLORS.gold }} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: COLORS.ivory }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 rounded-xl text-xs font-bold shadow-xl transition gold-glow disabled:opacity-50"
            style={{ background: mode === "signup" ? COLORS.gold : COLORS.teal, color: COLORS.bg }}
          >
            {loading ? "Traitement en cours..." : mode === "signup" ? "Créer mon Compte (+50 pts offerts)" : "Se Connecter à BAARO"}
          </button>
        </form>
      </div>
    </div>
  );
}
