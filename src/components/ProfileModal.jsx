import { useState } from "react";
import { Flag, UserX, X, UserPlus, Check, MessageSquare, BadgeCheck, Coins, Award } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { getUserById } from "../data/users.js";

export function ProfileModal({ authorId, onClose, onNavigateToMessages }) {
  const { showToast } = useToast();
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionDone, setActionDone] = useState(null);

  const user = getUserById(authorId);

  const report = () => {
    setActionDone("Signalement transmis à l'équipe de modération.");
    showToast("Signalement envoyé", "info");
  };

  const block = () => {
    setActionDone(`Compte ${user.display_name} bloqué.`);
    showToast("Membre bloqué avec succès", "info");
  };

  const toggleFollow = () => {
    setIsFollowing(!isFollowing);
    showToast(isFollowing ? "Abonnement retiré" : `Abonné(e) à ${user.display_name} ! (+2 pts)`, "success");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg glass-card rounded-t-3xl sm:rounded-3xl p-6 border shadow-2xl flex flex-col gap-4" style={{ borderColor: COLORS.borderGold }}>
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: "rgba(255,255,255,0.2)" }} />

        {/* Modal Top Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-bold text-xl gold-glow border" style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}>
              {user.avatar ? (
                <img src={user.avatar} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                <span style={{ color: COLORS.gold }}>{user.initials}</span>
              )}
            </div>
            <div>
              <div className="text-base font-bold flex items-center gap-1.5" style={{ color: COLORS.ivory }}>
                {user.display_name} {user.flag}
                {user.isVerified && <BadgeCheck size={16} style={{ color: COLORS.teal }} />}
              </div>
              <div className="text-xs flex items-center gap-2" style={{ color: COLORS.muted }}>
                <span>{user.handle}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>
                  {user.tier}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={report} title="Signaler" className="p-2 rounded-xl border hover:bg-white/5" style={{ borderColor: COLORS.border, color: COLORS.muted }}>
              <Flag size={15} />
            </button>
            <button onClick={block} title="Bloquer" className="p-2 rounded-xl border hover:bg-white/5 text-rose-400" style={{ borderColor: COLORS.border }}>
              <UserX size={15} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl border hover:bg-white/5" style={{ borderColor: COLORS.border, color: COLORS.ivory }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {actionDone && (
          <div className="text-xs p-2.5 rounded-xl border font-medium" style={{ background: COLORS.goldGlow, borderColor: COLORS.borderGold, color: COLORS.gold }}>
            {actionDone}
          </div>
        )}

        {/* Bio */}
        <p className="text-xs leading-relaxed" style={{ color: COLORS.ivory }}>
          {user.bio}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl border text-center font-mono text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>{user.followers.toLocaleString()}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>Abonnés</div>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.gold }}>{user.points}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>Points Réseau</div>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.teal }}>{user.baroBalance}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>BARO Coin</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={toggleFollow}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg transition"
            style={{
              background: isFollowing ? COLORS.surface2 : COLORS.gold,
              color: isFollowing ? COLORS.gold : COLORS.bg,
              border: isFollowing ? `1px solid ${COLORS.borderGold}` : "none"
            }}
          >
            {isFollowing ? <Check size={16} /> : <UserPlus size={16} />}
            <span>{isFollowing ? "Abonné(e)" : "S'abonner"}</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onNavigateToMessages();
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border hover:border-teal-400 transition"
            style={{ background: COLORS.surface, borderColor: COLORS.borderTeal, color: COLORS.teal }}
          >
            <MessageSquare size={16} />
            <span>Message Direct</span>
          </button>
        </div>
      </div>
    </div>
  );
}
