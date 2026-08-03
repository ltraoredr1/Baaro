import { useState, useEffect } from "react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";
import { useToast } from "./ToastContext.jsx";

const FLAGS = [
  "🌍", "🇫🇷", "🇸🇳", "🇨🇮", "🇲🇱", "🇬🇳", "🇧🇫", "🇳🇪", "🇹🇬", "🇧🇯",
  "🇨🇲", "🇬🇦", "🇨🇬", "🇨🇩", "🇺🇸", "🇬🇧", "🇨🇦", "🇧🇪", "🇨🇭",
  "🇲🇦", "🇩🇿", "🇹🇳", "🇪🇸", "🇵🇹", "🇩🇪", "🇮🇹", "🇧🇷", "🇭🇹",
];

const THEMES = [
  { id: "midnight", label: "Minuit", color: "#0B1220" },
  { id: "oled", label: "OLED", color: "#000000" },
  { id: "emerald", label: "Émeraude", color: "#061A14" },
];

export function SettingsTab({ currentTheme, onSelectTheme }) {
  const { userProfile, updateProfile, userId } = useApp();
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [flag, setFlag] = useState("🌍");
  const [saving, setSaving] = useState(false);

  // Synchronise les champs quand le profil change
  useEffect(() => {
    setDisplayName(userProfile.display_name || "");
    setHandle(userProfile.handle || "");
    setBio(userProfile.bio || "");
    setFlag(userProfile.flag || "🌍");
  }, [userProfile]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      showToast("Le nom d'affichage est obligatoire", "error");
      return;
    }

    const cleanHandle = handle.trim().startsWith("@")
      ? handle.trim()
      : `@${handle.trim()}`;

    if (cleanHandle.length < 3) {
      showToast("L'identifiant est trop court", "error");
      return;
    }

    setSaving(true);

    const result = await updateProfile({
      display_name: displayName.trim(),
      handle: cleanHandle,
      bio: bio.trim().slice(0, 160),
      flag,
    });

    setSaving(false);

    if (result.ok) {
      showToast("Profil mis à jour avec succès", "success");
    } else {
      showToast(
        result.error?.message || "Erreur lors de la sauvegarde",
        "error"
      );
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 pb-20">
      <h2 className="text-lg font-bold" style={{ color: COLORS.gold }}>
        Paramètres
      </h2>

      {/* ========== PROFIL ========== */}
      <section
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.border }}
      >
        <h3 className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
          Mon profil
        </h3>

        {/* Aperçu */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: COLORS.surface }}>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border"
            style={{ borderColor: COLORS.borderGold, background: COLORS.bg }}
          >
            <span style={{ color: COLORS.gold }}>
              {displayName?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
              {displayName || "Membre BAARO"} {flag}
            </div>
            <div className="text-xs" style={{ color: COLORS.muted }}>
              {handle || "@membre"}
            </div>
          </div>
        </div>

        {/* Nom d'affichage */}
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: COLORS.muted }}>
            Nom d'affichage
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Votre nom"
            maxLength={40}
            className="w-full px-3 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          />
        </div>

        {/* Handle */}
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: COLORS.muted }}>
            Identifiant (@handle)
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@mon_identifiant"
            maxLength={30}
            className="w-full px-3 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          />
        </div>

        {/* Bio */}
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: COLORS.muted }}>
            Bio <span className="opacity-60">({bio.length}/160)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 160))}
            placeholder="Parlez un peu de vous..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border bg-transparent outline-none text-sm resize-none"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          />
        </div>

        {/* Drapeau */}
        <div>
          <label className="text-xs mb-2 block" style={{ color: COLORS.muted }}>
            Drapeau / Émoji
          </label>
          <div className="flex flex-wrap gap-2">
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFlag(f)}
                className="w-10 h-10 rounded-xl text-lg flex items-center justify-center border transition hover:scale-105"
                style={{
                  background: flag === f ? COLORS.gold : COLORS.surface,
                  borderColor: flag === f ? COLORS.gold : COLORS.border,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-1 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
            color: COLORS.bg,
          }}
        >
          {saving ? "Enregistrement..." : "Enregistrer le profil"}
        </button>
      </section>

      {/* ========== THÈME ========== */}
      <section
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.border }}
      >
        <h3 className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
          Apparence
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme?.(theme.id)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border transition"
              style={{
                background: currentTheme === theme.id ? "rgba(217,174,82,0.15)" : COLORS.surface,
                borderColor: currentTheme === theme.id ? COLORS.gold : COLORS.border,
              }}
            >
              <div
                className="w-10 h-10 rounded-full border-2"
                style={{
                  background: theme.color,
                  borderColor: currentTheme === theme.id ? COLORS.gold : COLORS.border,
                }}
              />
              <span className="text-xs font-medium" style={{ color: COLORS.ivory }}>
                {theme.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ========== INFOS COMPTE ========== */}
      <section
        className="glass-card rounded-2xl p-5 border flex flex-col gap-2"
        style={{ borderColor: COLORS.border }}
      >
        <h3 className="text-sm font-semibold mb-1" style={{ color: COLORS.ivory }}>
          Compte
        </h3>
        <div className="text-xs" style={{ color: COLORS.muted }}>
          ID utilisateur
        </div>
        <div
          className="text-xs font-mono p-2 rounded-lg break-all"
          style={{ background: COLORS.surface, color: COLORS.ivory }}
        >
          {userId || "—"}
        </div>
      </section>
    </div>
  );
}
