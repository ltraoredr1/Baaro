import { useState } from "react";
import { supabase } from "../supabaseClient";
import { User, ShieldCheck, Moon, Sun, Lock, Award, Check, Smartphone, Download, Sparkles, UserX, ShieldAlert, Palette, LogOut } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { STABLE_USERS } from "../data/users.js";

const SUBSCRIPTION_TIERS = [
  { id: "free", name: "Découverte", price: "Gratuit", features: ["Fil et interactions de base", "Gain de points standard", "Accès limité à l'assistant IA"] },
  { id: "plus", name: "Plus", price: "4,99 €/mois", features: ["Points x1.5 sur toutes les actions", "Assistant IA illimité", "Badge Or visible sur le profil"] },
  { id: "pro", name: "Créateur Pro", price: "14,99 €/mois", features: ["Part publicitaire prioritaire", "Statistiques avancées de profit", "Support dédié et boosts hebdomadaires offerts"] },
];

export function SettingsTab({ userProfile, setUserProfile, currentTheme, onSelectTheme }) {
  const { showToast } = useToast();
  
  // État local du profil
  const [displayName, setDisplayName] = useState(userProfile?.display_name || "Membre BAARO");
  const [bio, setBio] = useState(userProfile?.bio || "Passionné de Web3, de réseaux décentralisés et d'impact social.");
  const [flag, setFlag] = useState(userProfile?.flag || "🌍");
  const [activeTier, setActiveTier] = useState("plus");
  const [blockedUsers, setBlockedUsers] = useState([STABLE_USERS[2]]);
  
  // États pour la modification
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(userProfile?.display_name || "Membre BAARO");
  const [editBio, setEditBio] = useState(userProfile?.bio || "Passionné de Web3, de réseaux décentralisés et d'impact social.");
  const [editFlag, setEditFlag] = useState(userProfile?.flag || "🌍");
  const [loading, setLoading] = useState(false);

  // Vérifier si l'utilisateur peut modifier son profil (1 fois par semaine)
  const lastUpdate = localStorage.getItem('profile_last_update');
  const today = new Date().toDateString();
  const canEdit = !lastUpdate || lastUpdate !== today;

  // Sauvegarder le profil dans Supabase
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté');

      // 1. Mettre à jour dans auth.users
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          display_name: editDisplayName,
          handle: userProfile?.handle || '@membre_' + user.id.substring(0, 8),
          flag: editFlag,
          bio: editBio
        }
      });
      if (authError) throw authError;

      // 2. Mettre à jour dans la table users
      const { error: dbError } = await supabase
        .from('users')
        .update({
          display_name: editDisplayName,
          flag: editFlag,
          bio: editBio,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 3. Mettre à jour le state local
      setUserProfile({
        ...userProfile,
        display_name: editDisplayName,
        flag: editFlag,
        bio: editBio
      });

      // 4. Mettre à jour les états locaux
      setDisplayName(editDisplayName);
      setBio(editBio);
      setFlag(editFlag);

      // 5. Enregistrer la date de modification
      localStorage.setItem('profile_last_update', today);

      setIsEditing(false);
      showToast("✅ Profil mis à jour avec succès !", "success");
    } catch (error) {
      showToast("❌ Erreur : " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Annuler les modifications
  const handleCancelEdit = () => {
    setEditDisplayName(displayName);
    setEditBio(bio);
    setEditFlag(flag);
    setIsEditing(false);
  };

  const handleSelectTier = (tierId, tierName) => {
    setActiveTier(tierId);
    showToast(`Abonnement ${tierName} activé !`, "success");
  };

  const handleUnblock = (userId, name) => {
    setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    showToast(`${name} a été débloqué`, "info");
  };

  const handleLogout = async () => {
    if (window.confirm("Voulez-vous vraiment vous déconnecter ?")) {
      try {
        await supabase.auth.signOut();
        showToast("Déconnexion réussie !", "success");
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } catch (error) {
        showToast("Erreur lors de la déconnexion", "error");
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-20">
      {/* Profile Edition */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.borderGold }}>
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: COLORS.border }}>
          <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
            <User size={18} />
            Profil Utilisateur
          </h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>Compte Vérifié</span>
        </div>

        {/* Affichage du profil */}
        {!isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{flag}</span>
              <div>
                <p className="text-xl font-bold text-white">{displayName}</p>
                <p className="text-sm text-gray-400">{userProfile?.handle || '@utilisateur'}</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm">{bio}</p>
            <button
              onClick={() => {
                setEditDisplayName(displayName);
                setEditBio(bio);
                setEditFlag(flag);
                setIsEditing(true);
              }}
              disabled={!canEdit}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                canEdit 
                  ? 'bg-gold-500 text-black hover:bg-gold-400' 
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {canEdit ? '✏️ Modifier le profil' : '⏳ Modifiable la semaine prochaine'}
            </button>
            {!canEdit && (
              <p className="text-xs text-gray-500">Vous ne pouvez modifier votre profil qu'une fois par semaine.</p>
            )}
          </div>
        ) : (
          /* Formulaire d'édition */
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Nom d'affichage</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-transparent border rounded-xl p-2.5 text-xs outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Drapeau / Pays</label>
                <input
                  type="text"
                  value={editFlag}
                  onChange={(e) => setEditFlag(e.target.value)}
                  className="w-full bg-transparent border rounded-xl p-2.5 text-xs outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>Bio / Présentation</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={2}
                className="w-full bg-transparent border rounded-xl p-2.5 text-xs outline-none resize-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-xs font-bold shadow-lg transition gold-glow"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                {loading ? '⏳ Enregistrement...' : '💾 Enregistrer'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-5 py-2 rounded-xl text-xs font-bold transition"
                style={{ background: COLORS.surface2, color: COLORS.muted }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Theme Selector Section */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.borderTeal }}>
        <h3 className="text-base font-bold text-gradient-teal flex items-center gap-2">
          <Palette size={18} />
          Thème Visuel & Apparence
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onSelectTheme("midnight")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition ${currentTheme === "midnight" ? "gold-glow" : ""}`}
            style={{
              background: "#0B1220",
              borderColor: currentTheme === "midnight" ? COLORS.gold : COLORS.border
            }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold" style={{ color: "#F4EFE3" }}>Midnight Gold</span>
              {currentTheme === "midnight" && <Check size={14} style={{ color: COLORS.gold }} />}
            </div>
            <span className="text-[10px]" style={{ color: COLORS.muted }}>Marine sombre classique</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTheme("oled")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition ${currentTheme === "oled" ? "gold-glow" : ""}`}
            style={{
              background: "#000000",
              borderColor: currentTheme === "oled" ? COLORS.gold : COLORS.border
            }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold" style={{ color: "#FFFFFF" }}>OLED Black</span>
              {currentTheme === "oled" && <Check size={14} style={{ color: COLORS.gold }} />}
            </div>
            <span className="text-[10px]" style={{ color: COLORS.muted }}>Noir pur économie batterie</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTheme("emerald")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition ${currentTheme === "emerald" ? "gold-glow" : ""}`}
            style={{
              background: "#061A14",
              borderColor: currentTheme === "emerald" ? COLORS.teal : COLORS.border
            }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold" style={{ color: "#4EE1C8" }}>Deep Emerald</span>
              {currentTheme === "emerald" && <Check size={14} style={{ color: COLORS.teal }} />}
            </div>
            <span className="text-[10px]" style={{ color: COLORS.muted }}>Vert émeraude décentralisé</span>
          </button>
        </div>
      </div>

      {/* Blocked Accounts & Community Moderation */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.border }}>
        <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
          <ShieldAlert size={18} />
          Sécurité & Modération des Comptes
        </h3>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>Comptes Bloqués ({blockedUsers.length})</span>
          {blockedUsers.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: COLORS.muted }}>Aucun compte bloqué.</div>
          ) : (
            blockedUsers.map((u) => (
              <div key={u.id} className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                <div className="flex items-center gap-2">
                  <UserX size={16} className="text-rose-400" />
                  <span style={{ color: COLORS.ivory }}>{u.display_name} {u.flag} ({u.handle})</span>
                </div>
                <button
                  onClick={() => handleUnblock(u.id, u.display_name)}
                  className="px-3 py-1 rounded-lg text-xs font-bold border hover:border-amber-400"
                  style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.gold }}
                >
                  Débloquer
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Subscriptions Tiers Cards */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.border }}>
        <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
          <Award size={18} />
          Niveaux d'Abonnement BAARO
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const isSelected = activeTier === tier.id;
            return (
              <div
                key={tier.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between transition ${isSelected ? "gold-glow" : ""}`}
                style={{
                  background: isSelected ? COLORS.surface2 : COLORS.surface,
                  borderColor: isSelected ? COLORS.borderGold : COLORS.border
                }}
              >
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold" style={{ color: isSelected ? COLORS.gold : COLORS.ivory }}>{tier.name}</span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full" style={{ background: COLORS.gold }} />
                    )}
                  </div>
                  <div className="text-lg font-bold font-mono mt-1" style={{ color: COLORS.gold }}>{tier.price}</div>

                  <ul className="mt-3 flex flex-col gap-1.5 text-[11px]" style={{ color: COLORS.muted }}>
                    {tier.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <Check size={12} style={{ color: COLORS.teal }} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => handleSelectTier(tier.id, tier.name)}
                  className="w-full mt-4 py-2 rounded-xl text-xs font-bold border transition"
                  style={{
                    background: isSelected ? COLORS.gold : "transparent",
                    borderColor: isSelected ? COLORS.borderGold : COLORS.border,
                    color: isSelected ? COLORS.bg : COLORS.ivory
                  }}
                >
                  {isSelected ? "Actif" : "S'abonner"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🚪 BOUTON DE DÉCONNEXION */}
      <div className="glass-card rounded-2xl p-5 border" style={{ borderColor: COLORS.border }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#f87171"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
          }}
        >
          <LogOut size={18} />
          Se déconnecter
        </button>
        <p className="text-[10px] text-center mt-2" style={{ color: COLORS.muted }}>
          Vous serez redirigé vers l'écran de connexion
        </p>
      </div>
    </div>
  );
}
