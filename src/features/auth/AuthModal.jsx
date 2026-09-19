import { useState } from "react";
import { User, Lock, Mail, Flag, X, LogIn, UserPlus, AlertCircle, Phone, KeyRound, MessageSquare } from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { supabase } from "../../supabaseClient.js";

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState("signup"); // "signup" ou "login"
  const [authMethod, setAuthMethod] = useState("email"); // "email", "sms", ou "whatsapp"

  // Champs de saisie
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [flag, setFlag] = useState("🇲🇱");

  // État OTP
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!isOpen) return null;

  const handleMethodSwitch = (method) => {
    setAuthMethod(method);
    setOtpSent(false);
    setErrorMessage(null);
  };

  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    setOtpSent(false);
    setErrorMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      // -------------------------------------------------------------
      // CAS 1 : Connexion / Inscription par TÉLÉPHONE (SMS ou WHATSAPP)
      // -------------------------------------------------------------
      if (authMethod === "sms" || authMethod === "whatsapp") {
        if (!phone.trim()) {
          setErrorMessage("Veuillez saisir votre numéro au format international (ex: +223XXXXXXXX).");
          setLoading(false);
          return;
        }

        const formattedPhone = phone.trim().startsWith("+") ? phone.trim() : `+${phone.trim()}`;

        // Étape 1 : Demande d'envoi de l'OTP
        if (!otpSent) {
          const { error } = await supabase.auth.signInWithOtp({
            phone: formattedPhone,
            options: {
              channel: authMethod === "whatsapp" ? "whatsapp" : "sms",
              data: mode === "signup" ? {
                display_name: displayName.trim() || "Utilisateur",
                handle: handle.trim() ? (handle.startsWith("@") ? handle : `@${handle}`) : `@user_${Date.now()}`,
                flag: flag || "🌍"
              } : undefined
            }
          });

          if (error) throw error;

          setOtpSent(true);
          showToast(
            authMethod === "whatsapp" 
              ? "Code de vérification envoyé sur WhatsApp !" 
              : "Code envoyé par SMS !", 
            "info"
          );
          setLoading(false);
          return;
        }

        // Étape 2 : Vérification du code OTP reçu
        if (otpSent) {
          if (!otpCode.trim()) {
            setErrorMessage("Veuillez saisir le code de vérification.");
            setLoading(false);
            return;
          }

          const { data, error } = await supabase.auth.verifyOtp({
            phone: formattedPhone,
            token: otpCode.trim(),
            type: authMethod === "whatsapp" ? "whatsapp" : "sms"
          });

          if (error) throw error;
          if (!data?.session || !data?.user) throw new Error("Échec de la validation du code.");

          // Récupération de l'ID unique de l'utilisateur généré par Supabase
          const userId = data.user.id;
          const userMetaData = data.user.user_metadata || {};

          const profileData = {
            id: userId, // <-- Identifiant unique Supabase (UUID)
            display_name: userMetaData.display_name || displayName.trim() || phone,
            handle: userMetaData.handle || handle.trim() || `@user_${phone.replace(/\D/g, "")}`,
            flag: userMetaData.flag || flag || "🌍",
            phone: formattedPhone
          };

          onAuthSuccess(profileData);
          showToast(
            mode === "signup" 
              ? `Bienvenue sur BAARO ! Compte créé avec succès. (+50 pts)` 
              : "Connexion réussie !", 
            "success"
          );
          onClose();
        }
        return;
      }

      // -------------------------------------------------------------
      // CAS 2 : Authentification par EMAIL
      // -------------------------------------------------------------
      if (mode === "signup") {
        if (!email.trim() || !password.trim() || !displayName.trim()) {
          setErrorMessage("Veuillez remplir tous les champs obligatoires.");
          setLoading(false);
          return;
        }

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

        if (error) throw error;

        if (!data?.session) {
          setErrorMessage("Compte créé. Vérifiez votre e-mail pour confirmer votre adresse.");
          setLoading(false);
          return;
        }

        const newUserProfile = {
          id: data.user.id, // <-- Identifiant unique Supabase (UUID)
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
        // Connexion Email
        if (!email.trim() || !password.trim()) {
          setErrorMessage("Veuillez saisir votre e-mail et mot de passe.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (error) throw error;
        if (!data?.session || !data?.user) throw new Error("Session non créée.");

        const userMetaData = data.user.user_metadata || {};

        const loggedInProfile = {
          id: data.user.id, // <-- Identifiant unique Supabase (UUID)
          display_name: userMetaData.display_name || email.split("@")[0],
          handle: userMetaData.handle || `@${email.split("@")[0]}`,
          flag: userMetaData.flag || "🌍",
          email: email.trim()
        };

        onAuthSuccess(loggedInProfile);
        showToast("Connexion réussie ! Ravie de vous revoir.", "success");
        onClose();
      }
    } catch (err) {
      setErrorMessage(err.message || "Une erreur est survenue lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-card rounded-3xl p-6 border shadow-2xl flex flex-col gap-4"
        style={{ borderColor: COLORS.borderGold }}
      >
        {/* En-tête */}
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

        {/* Mode Toggle (Inscription / Connexion) */}
        <div className="flex rounded-xl p-1 border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
          <button
            type="button"
            onClick={() => handleModeSwitch("signup")}
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
            onClick={() => handleModeSwitch("login")}
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

        {/* Sélection du moyen d'authentification */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => handleMethodSwitch("email")}
            className="flex-1 py-1.5 text-[11px] rounded-lg border font-medium transition flex items-center justify-center gap-1"
            style={{
              borderColor: authMethod === "email" ? COLORS.gold : COLORS.border,
              background: authMethod === "email" ? `${COLORS.gold}15` : "transparent",
              color: authMethod === "email" ? COLORS.gold : COLORS.muted
            }}
          >
            <Mail size={12} />
            <span>Email</span>
          </button>

          <button
            type="button"
            onClick={() => handleMethodSwitch("sms")}
            className="flex-1 py-1.5 text-[11px] rounded-lg border font-medium transition flex items-center justify-center gap-1"
            style={{
              borderColor: authMethod === "sms" ? COLORS.gold : COLORS.border,
              background: authMethod === "sms" ? `${COLORS.gold}15` : "transparent",
              color: authMethod === "sms" ? COLORS.gold : COLORS.muted
            }}
          >
            <Phone size={12} />
            <span>SMS</span>
          </button>

          <button
            type="button"
            onClick={() => handleMethodSwitch("whatsapp")}
            className="flex-1 py-1.5 text-[11px] rounded-lg border font-medium transition flex items-center justify-center gap-1"
            style={{
              borderColor: authMethod === "whatsapp" ? "#25D366" : COLORS.border,
              background: authMethod === "whatsapp" ? "#25D36615" : "transparent",
              color: authMethod === "whatsapp" ? "#25D366" : COLORS.muted
            }}
          >
            <MessageSquare size={12} />
            <span>WhatsApp</span>
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl border text-xs flex items-center gap-2 text-rose-400 bg-rose-500/10 border-rose-500/30">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Nom d'affichage</label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                  <User size={14} style={{ color: COLORS.gold }} />
                  <input
                    type="text"
                    required={mode === "signup"}
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
                  placeholder="🇲🇱"
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

          {/* Saisie Email */}
          {authMethod === "email" ? (
            <>
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
            </>
          ) : (
            /* Saisie Téléphone (SMS & WhatsApp) */
            <>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>
                  Numéro WhatsApp / Téléphone
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                  {authMethod === "whatsapp" ? (
                    <MessageSquare size={14} style={{ color: "#25D366" }} />
                  ) : (
                    <Phone size={14} style={{ color: COLORS.teal }} />
                  )}
                  <input
                    type="tel"
                    required
                    disabled={otpSent}
                    placeholder="+223 00 00 00 00"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent text-xs outline-none disabled:opacity-50"
                    style={{ color: COLORS.ivory }}
                  />
                </div>
              </div>

              {otpSent && (
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Code reçu</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                    <KeyRound size={14} style={{ color: COLORS.gold }} />
                    <input
                      type="text"
                      required
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-transparent text-xs outline-none font-mono tracking-widest"
                      style={{ color: COLORS.ivory }}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setOtpSent(false)} 
                    className="text-[10px] mt-1 underline" 
                    style={{ color: COLORS.muted }}
                  >
                    Modifier le numéro
                  </button>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 rounded-xl text-xs font-bold shadow-xl transition gold-glow disabled:opacity-50"
            style={{ 
              background: authMethod === "whatsapp" 
                ? "#25D366" 
                : (mode === "signup" ? COLORS.gold : COLORS.teal), 
              color: authMethod === "whatsapp" ? "#ffffff" : COLORS.bg 
            }}
          >
            {loading 
              ? "Traitement en cours..." 
              : (authMethod === "sms" || authMethod === "whatsapp")
                ? (otpSent ? "Vérifier le code" : `Recevoir le code via ${authMethod === "whatsapp" ? "WhatsApp" : "SMS"}`) 
                : (mode === "signup" ? "Créer mon Compte (+50 pts offerts)" : "Se Connecter à BAARO")
            }
          </button>
        </form>
      </div>
    </div>
  );
}
