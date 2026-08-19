import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  User,
  Award,
  Check,
  Palette,
  LogOut,
  ShieldCheck,
  Sparkles,
  FileText,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { PrivacyPage } from "./PrivacyPage.jsx";
import { PushSettings } from "./PushSettings.jsx";

const SUBSCRIPTION_TIERS = [
  {
    id: "free",
    name: "Découverte",
    price: "Gratuit",
    features: [
      "Fil et interactions de base",
      "Gain de points standard",
      "Accès limité à l'assistant IA",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "4,99 €/mois",
    features: [
      "Points x1.5 sur toutes les actions",
      "Assistant IA illimité",
      "Badge Or visible sur le profil",
    ],
  },
  {
    id: "pro",
    name: "Créateur Pro",
    price: "14,99 €/mois",
    features: [
      "Part publicitaire prioritaire",
      "Statistiques avancées",
      "Support dédié et boosts hebdomadaires",
    ],
  },
];

export function SettingsTab({
  userProfile,
  setUserProfile,
  currentTheme,
  onSelectTheme,
  onReplayOnboarding,
}) {
  const [displayName, setDisplayName] = useState(
    userProfile?.display_name || "Membre BAARO"
  );
  const [bio, setBio] = useState(userProfile?.bio || "");
  const [flag, setFlag] = useState(userProfile?.flag || "🌍");
  const [activeTier, setActiveTier] = useState("free");
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(displayName);
  const [editBio, setEditBio] = useState(bio);
  const [editFlag, setEditFlag] = useState(flag);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [isAnonymousUser, setIsAnonymousUser] = useState(false);
  const [secureEmail, setSecureEmail] = useState("");
  const [securePassword, setSecurePassword] = useState("");
  const [secureLoading, setSecureLoading] = useState(false);
  const [secureOauthLoading, setSecureOauthLoading] = useState(null);
  const [secureMessage, setSecureMessage] = useState("");
  const [showLoginFallback, setShowLoginFallback] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAnonymousUser(data?.user?.is_anonymous === true);
    });
  }, []);

  if (showPrivacy) {
    return <PrivacyPage onBack={() => setShowPrivacy(false)} />;
  }

  const handleSecureWithEmail = async (e) => {
    e.preventDefault();
    if (secureLoading) return;
    setSecureLoading(true);
    setSecureMessage("");
    setShowLoginFallback(false);

    try {
      const { error } = await supabase.auth.updateUser({
        email: secureEmail,
        password: securePassword,
      });

      if (error) {
        if (error.message?.toLowerCase().includes("already been registered")) {
          setSecureMessage(
            "⚠️ Un compte existe déjà avec cet e-mail. Vous pouvez vous y connecter, mais l'historique de cette session invité ne sera pas transféré automatiquement."
          );
          setShowLoginFallback(true);
          return;
        }
        throw error;
      }

      setSecureMessage(
        "✅ Vérifiez votre boîte mail pour confirmer l'adresse — votre compte deviendra stable une fois le lien cliqué."
      );
    } catch (err) {
      setSecureMessage("❌ " + (err.message || "Erreur"));
    } finally {
      setSecureLoading(false);
    }
  };

  const handleLoginToExistingAccount = async () => {
    if (secureLoading) return;
    setSecureLoading(true);
    setSecureMessage("");

    try {
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({
        email: secureEmail,
        password: securePassword,
      });
      if (error) throw error;
    } catch (err) {
      setSecureMessage(
        "❌ " +
          (err.message?.toLowerCase().includes("invalid login credentials")
            ? "Mot de passe incorrect pour ce compte."
            : err.message || "Erreur de connexion")
      );
    } finally {
      setSecureLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (secureLoading || !secureEmail) return;
    setSecureLoading(true);
    setSecureMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(secureEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setSecureMessage("✅ E-mail de réinitialisation envoyé.");
    } catch (err) {
      setSecureMessage("❌ " + (err.message || "Erreur lors de l'envoi"));
    } finally {
      setSecureLoading(false);
    }
  };

  const handleSecureWithOAuth = async (provider) => {
    if (secureOauthLoading) return;
    setSecureOauthLoading(provider);
    setSecureMessage("");

    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setSecureMessage("❌ " + (err.message || "Erreur"));
      setSecureOauthLoading(null);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: editDisplayName,
          flag: editFlag,
          bio: editBio,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      const updated = {
        ...userProfile,
        display_name: editDisplayName,
        flag: editFlag,
        bio: editBio,
      };
      setUserProfile?.(updated);
      setDisplayName(editDisplayName);
      setBio(editBio);
      setFlag(editFlag);
      setIsEditing(false);
      setMessage("✅ Profil mis à jour");
    } catch (err) {
      console.error(err);
      setMessage("❌ " + (err.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Voulez-vous vraiment vous déconnecter ?")) return;
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div
      className="flex flex-col gap-5 max-w-3xl mx-auto w-full pb-28 px-1"
      style={{ color: COLORS.ivory, minHeight: "60vh" }}
    >
      <h2 className="text-xl font-bold flex items-center gap-2">
        <User size={22} style={{ color: COLORS.gold }} />
        Réglages
      </h2>

      {message && (
        <div
          className="p-3 rounded-xl text-sm"
          style={{
            background: message.startsWith("✅")
              ? "rgba(45,191,166,0.15)"
              : "rgba(239,68,68,0.15)",
            color: message.startsWith("✅") ? COLORS.teal : "#F87171",
          }}
        >
          {message}
        </div>
      )}

      {isAnonymousUser && (
        <div
          className="rounded-2xl p-5 border flex flex-col gap-4"
          style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
        >
          <h3
            className="text-base font-bold flex items-center gap-2"
            style={{ color: COLORS.gold }}
          >
            <ShieldCheck size={18} />
            Sécuriser mon compte
          </h3>
          <p className="text-sm" style={{ color: COLORS.muted }}>
            Compte invité : sécurisez avec email ou réseau social pour gagner des
            points et conserver votre historique.
          </p>

          {secureMessage && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                background: secureMessage.startsWith("✅")
                  ? "rgba(45,191,166,0.15)"
                  : secureMessage.startsWith("⚠️")
                    ? "rgba(217,174,82,0.15)"
                    : "rgba(239,68,68,0.15)",
                color: secureMessage.startsWith("✅")
                  ? COLORS.teal
                  : secureMessage.startsWith("⚠️")
                    ? COLORS.gold
                    : "#F87171",
              }}
            >
              {secureMessage}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleSecureWithOAuth("facebook")}
              disabled={!!secureOauthLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
              style={{ background: "#1877F2", color: "#fff" }}
            >
              {secureOauthLoading === "facebook" ? "Connexion..." : "Lier Facebook"}
            </button>
            <button
              type="button"
              onClick={() => handleSecureWithOAuth("twitter")}
              disabled={!!secureOauthLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
              style={{
                background: "#000000",
                color: "#fff",
                border: "1px solid " + COLORS.border,
              }}
            >
              {secureOauthLoading === "twitter" ? "Connexion..." : "Lier X"}
            </button>
          </div>

          <form onSubmit={handleSecureWithEmail} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={secureEmail}
              onChange={(e) => {
                setSecureEmail(e.target.value);
                setShowLoginFallback(false);
              }}
              required
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={securePassword}
              onChange={(e) => setSecurePassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <button
              type="submit"
              disabled={secureLoading}
              className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
                color: COLORS.bg,
              }}
            >
              {secureLoading ? "…" : "Sécuriser avec cet e-mail"}
            </button>
          </form>

          {showLoginFallback && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleLoginToExistingAccount}
                disabled={secureLoading}
                className="w-full py-3 rounded-xl font-bold text-sm border disabled:opacity-50"
                style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
              >
                Se connecter à ce compte existant
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={secureLoading}
                className="w-full text-xs underline text-center"
                style={{ color: COLORS.muted }}
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}
        </div>
      )}

      {/* Profil */}
      <div
        className="rounded-2xl p-5 border flex flex-col gap-4"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <h3 className="text-base font-bold flex items-center gap-2" style={{ color: COLORS.gold }}>
          <User size={18} />
          Profil
        </h3>
        {!isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{flag}</span>
              <div>
                <p className="text-lg font-bold">{displayName}</p>
                <p className="text-sm" style={{ color: COLORS.muted }}>
                  {userProfile?.handle || "@membre"}
                </p>
              </div>
            </div>
            {bio ? (
              <p className="text-sm" style={{ color: COLORS.mutedLight }}>
                {bio}
              </p>
            ) : null}
            <button
              onClick={() => {
                setEditDisplayName(displayName);
                setEditBio(bio);
                setEditFlag(flag);
                setIsEditing(true);
              }}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              Modifier le profil
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Nom"
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <input
              type="text"
              value={editFlag}
              onChange={(e) => setEditFlag(e.target.value)}
              placeholder="Drapeau"
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              rows={2}
              placeholder="Bio"
              className="w-full rounded-xl p-3 text-sm outline-none border resize-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                {loading ? "…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: COLORS.surface2, color: COLORS.muted }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Thèmes */}
      <div
        className="rounded-2xl p-5 border flex flex-col gap-4"
        style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}
      >
        <h3 className="text-base font-bold flex items-center gap-2" style={{ color: COLORS.teal }}>
          <Palette size={18} />
          Thème
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "midnight", label: "Nuit", bg: "#0B1220" },
            { id: "oled", label: "OLED", bg: "#000000" },
            { id: "emerald", label: "Émeraude", bg: "#061A14" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTheme?.(t.id)}
              className="p-3 rounded-xl border text-center text-xs font-bold"
              style={{
                background: t.bg,
                borderColor: currentTheme === t.id ? COLORS.gold : COLORS.border,
                color: COLORS.ivory,
              }}
            >
              {t.label}
              {currentTheme === t.id && (
                <Check size={12} className="inline ml-1" style={{ color: COLORS.gold }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Abonnements */}
      <div
        className="rounded-2xl p-5 border flex flex-col gap-4"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
      >
        <h3 className="text-base font-bold flex items-center gap-2" style={{ color: COLORS.gold }}>
          <Award size={18} />
          Abonnements
        </h3>
        <div className="flex flex-col gap-3">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const selected = activeTier === tier.id;
            return (
              <div
                key={tier.id}
                className="p-4 rounded-xl border"
                style={{
                  background: selected ? COLORS.surface2 : "transparent",
                  borderColor: selected ? COLORS.borderGold : COLORS.border,
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">{tier.name}</span>
                  <span className="text-sm font-bold" style={{ color: COLORS.gold }}>
                    {tier.price}
                  </span>
                </div>
                <ul className="text-xs space-y-1 mb-3" style={{ color: COLORS.muted }}>
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Check size={12} style={{ color: COLORS.teal }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setActiveTier(tier.id)}
                  className="w-full py-2 rounded-xl text-xs font-bold border"
                  style={{
                    background: selected ? COLORS.gold : "transparent",
                    borderColor: COLORS.borderGold,
                    color: selected ? COLORS.bg : COLORS.ivory,
                  }}
                >
                  {selected ? "Actif" : "Choisir"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notifications push */}
      <PushSettings />

      {onReplayOnboarding && (
        <button
          type="button"
          onClick={onReplayOnboarding}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border transition"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderGold,
            color: COLORS.gold,
          }}
        >
          <Sparkles size={16} />
          Revoir l&apos;introduction BAARO
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowPrivacy(true)}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border transition"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.borderTeal,
          color: COLORS.teal,
        }}
      >
        <FileText size={16} />
        Politique de confidentialité
      </button>

      <button
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold border"
        style={{
          borderColor: "rgba(239,68,68,0.4)",
          color: "#F87171",
          background: "rgba(239,68,68,0.1)",
        }}
      >
        <LogOut size={16} />
        Se déconnecter
      </button>
    </div>
  );
}
