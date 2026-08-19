import { useState } from "react";
import { Bell, CheckCheck, Trash2, X, Coins, Heart, MessageSquare, Award, Sparkles } from "lucide-react";
import { COLORS } from "../theme.js";

const INITIAL_NOTIFS = [
  { id: "n1", icon: Coins, color: "#D9AE52", title: "+15 Points Réseau", desc: "Publication créée avec succès", time: "Il y a 5 min", read: false },
  { id: "n2", icon: Heart, color: "#EC4899", title: "Nouveau J'aime", desc: "Kenji Takahashi a aimé votre publication", time: "Il y a 18 min", read: false },
  { id: "n3", icon: Coins, color: "#2DBFA6", title: "+10 Points Réseau", desc: "Bonus quotidien réclamé", time: "Il y a 1 heure", read: true },
  { id: "n4", icon: MessageSquare, color: "#8B5CF6", title: "Nouveau Message P2P", desc: "Sarah Jenkins vous a envoyé un message direct", time: "Il y a 2 heures", read: true },
  { id: "n5", icon: Award, color: "#D9AE52", title: "Badge Débloqué !", desc: "Vous avez obtenu le statut Créateur Émergent", time: "Hier", read: true },
];

export function NotificationDrawer({ isOpen, onClose }) {
  const [notifs, setNotifs] = useState(INITIAL_NOTIFS);

  if (!isOpen) return null;

  const markAllRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifs([]);
  };

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full glass-card border-l shadow-2xl p-5 flex flex-col justify-between"
        style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
      >
        {/* Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: COLORS.border }}>
            <div className="flex items-center gap-2">
              <Bell size={20} style={{ color: COLORS.gold }} />
              <h3 className="text-base font-bold" style={{ color: COLORS.ivory }}>Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: COLORS.teal, color: COLORS.bg }}>
                  {unreadCount} nouvelles
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: COLORS.border, color: COLORS.ivory }}>
              <X size={16} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex justify-between items-center py-2.5 text-xs font-semibold" style={{ color: COLORS.muted }}>
            <button onClick={markAllRead} className="flex items-center gap-1 hover:text-amber-400 transition">
              <CheckCheck size={14} />
              <span>Tout marquer lu</span>
            </button>
            <button onClick={clearAll} className="flex items-center gap-1 hover:text-rose-400 transition">
              <Trash2 size={14} />
              <span>Effacer</span>
            </button>
          </div>

          {/* Notifications Log */}
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[72vh] pr-1">
            {notifs.length === 0 ? (
              <div className="text-xs text-center py-10" style={{ color: COLORS.muted }}>
                Aucune notification pour le moment.
              </div>
            ) : (
              notifs.map((n) => {
                const Icon = n.icon;
                return (
                  <div
                    key={n.id}
                    className={`p-3 rounded-2xl border flex items-start gap-3 transition ${!n.read ? "gold-glow" : ""}`}
                    style={{
                      background: !n.read ? COLORS.surface2 : COLORS.bg,
                      borderColor: !n.read ? COLORS.borderGold : COLORS.border
                    }}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${n.color}20`, color: n.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold truncate" style={{ color: COLORS.ivory }}>{n.title}</span>
                        <span className="text-[9px]" style={{ color: COLORS.muted }}>{n.time}</span>
                      </div>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: COLORS.muted }}>{n.desc}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t text-[11px] text-center" style={{ borderColor: COLORS.border, color: COLORS.muted }}>
          BAARO Realtime Push Engine v1.8
        </div>
      </div>
    </div>
  );
}
