import { useState, useEffect } from "react";
import {
  Gift,
  CheckCircle,
  Zap,
  Coins,
  ArrowRightLeft,
  Clock,
  ShieldAlert,
  Gauge,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { useWallet } from "../hooks/useWallet.js";
import { GuestBanner } from "./GuestBanner.jsx";
import { ReferralSection } from "./ReferralSection.jsx";
import { RedeemSection } from "./RedeemSection.jsx";

const DAILY_TASKS = [
  { id: "t1", title: "Publier une pensée ou un article", pts: 5, actionKey: "publish_post", done: false },
  { id: "t2", title: "Donner un J'aime dans le fil", pts: 2, actionKey: "like_post", done: false },
  { id: "t3", title: "Ajouter un commentaire", pts: 1, actionKey: "comment", done: false },
  { id: "t4", title: "Participer à un débat", pts: 5, actionKey: null, done: false },
];

export function WalletTab({ onNavigateToCrypto }) {
  const {
    pointsBalance,
    baroBalance,
    earnPoints,
    isAnonymous,
    earnedToday,
    remainingToday,
    dailyCap,
    refreshWalletStatus,
  } = useWallet();
  const { showToast, showPointsReward } = useToast();
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [tasks, setTasks] = useState(DAILY_TASKS);
  const [pointsLog, setPointsLog] = useState([]);

  useEffect(() => {
    (async () => {
      const status = await refreshWalletStatus?.();
      if (status?.dailyClaimed) setDailyClaimed(true);
    })();
  }, [refreshWalletStatus]);

  const handleClaimDaily = async () => {
    if (dailyClaimed || claimLoading) return;
    if (isAnonymous) {
      showToast("Créez un compte pour réclamer le bonus quotidien", "info");
      return;
    }
    if (remainingToday <= 0) {
      showToast("Plafond quotidien déjà atteint", "info");
      return;
    }

    setClaimLoading(true);
    const result = await earnPoints("daily_bonus");
    setClaimLoading(false);

    if (result.ok) {
      setDailyClaimed(true);
      showPointsReward?.(10, "Bonus quotidien");
      setPointsLog((prev) => [
        {
          id: `l_${Date.now()}`,
          type: "Bonus quotidien",
          change: "+10 pts",
          date: "À l'instant",
          status: "Accrédité",
        },
        ...prev,
      ]);
      showToast("Bonus quotidien +10 pts !", "success");
    } else {
      showToast(result.error || "Impossible de réclamer le bonus", "error");
      if (result.error?.includes("déjà réclamé")) setDailyClaimed(true);
    }
  };

  const handleCompleteTask = async (task) => {
    if (task.done) return;
    if (isAnonymous) {
      showToast("Créez un compte pour gagner des points", "info");
      return;
    }
    if (!task.actionKey) {
      showToast("Cette mission se valide automatiquement dans l'app", "info");
      return;
    }
    if (remainingToday <= 0) {
      showToast("Plafond quotidien atteint — revenez demain", "info");
      return;
    }

    // Les tâches métier doivent être déclenchées depuis l'action réelle,
    // pas depuis ce bouton générique : le serveur exige désormais une
    // référence vérifiable. Le bouton ne réclame donc que le bonus quotidien.
    if (task.actionKey !== "daily_bonus") return;
    const result = await earnPoints(task.actionKey);
    if (result.ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, done: true } : t))
      );
      showPointsReward?.(task.pts, "Mission accomplie");
      setPointsLog((prev) => [
        {
          id: `l_${Date.now()}`,
          type: task.title,
          change: `+${task.pts} pts`,
          date: "À l'instant",
          status: "Accrédité",
        },
        ...prev,
      ]);
    } else {
      showToast(result.error || "Impossible d'attribuer les points", "error");
    }
  };

  const capPercent = dailyCap > 0 ? Math.min(100, (earnedToday / dailyCap) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-20">
      <GuestBanner />

      {/* Solde */}
      <div
        className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden gold-glow"
        style={{
          borderColor: COLORS.borderGold,
          background:
            "linear-gradient(135deg, rgba(26,39,64,0.9) 0%, rgba(217,174,82,0.15) 100%)",
        }}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs uppercase tracking-widest font-mono"
                style={{ color: COLORS.muted }}
              >
                Solde Réseau Mondial
              </span>
              {isAnonymous && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                  style={{ background: "rgba(236,72,153,0.2)", color: COLORS.rose }}
                >
                  <ShieldAlert size={10} />
                  Invité
                </span>
              )}
            </div>
            <h2 className="text-4xl font-extrabold font-mono text-gradient-gold mt-1">
              {pointsBalance}{" "}
              <span className="text-xl font-sans font-normal" style={{ color: COLORS.ivory }}>
                pts
              </span>
            </h2>
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: COLORS.teal }}>
              <Zap size={14} />
              <span>BARO : {Number(baroBalance).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button
              onClick={handleClaimDaily}
              disabled={dailyClaimed || claimLoading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-50"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Gift size={16} />
              <span>
                {dailyClaimed
                  ? "Bonus Réclamé"
                  : claimLoading
                    ? "…"
                    : "Réclamer Bonus (+10 pts)"}
              </span>
            </button>

            <button
              onClick={onNavigateToCrypto}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border hover:border-teal-400 transition"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.borderTeal,
                color: COLORS.teal,
              }}
            >
              <ArrowRightLeft size={16} />
              <span>Convertir en BARO</span>
            </button>
          </div>
        </div>

        {!isAnonymous && (
          <div
            className="mt-5 p-3 rounded-xl border flex flex-col gap-2"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5" style={{ color: COLORS.muted }}>
                <Gauge size={14} style={{ color: COLORS.gold }} />
                <span>Plafond quotidien</span>
              </div>
              <span className="font-mono font-bold" style={{ color: COLORS.gold }}>
                {earnedToday} / {dailyCap} pts
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface2 }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${capPercent}%`,
                  background:
                    remainingToday <= 0
                      ? COLORS.rose
                      : "linear-gradient(90deg, #D9AE52 0%, #2DBFA6 100%)",
                }}
              />
            </div>
            <p className="text-[11px]" style={{ color: COLORS.muted }}>
              {remainingToday > 0
                ? `Il vous reste ${remainingToday} pts à gagner aujourd'hui`
                : "Plafond atteint — revenez demain"}
            </p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t flex flex-col gap-1.5" style={{ borderColor: COLORS.border }}>
          <div className="flex justify-between text-xs font-medium" style={{ color: COLORS.muted }}>
            <span>Progression vers 500 pts</span>
            <span>{pointsBalance} / 500 pts</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (pointsBalance / 500) * 100)}%`,
                background: "linear-gradient(90deg, #D9AE52 0%, #2DBFA6 100%)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Parrainage réel */}
      <ReferralSection />

      {/* Récompenses / rachats */}
      <RedeemSection />

      {/* Missions */}
      <div
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gradient-gold">Missions Quotidiennes</h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: COLORS.goldGlow, color: COLORS.gold }}
          >
            Reset à minuit
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="p-3 rounded-xl border flex items-center justify-between text-xs transition"
              style={{ background: COLORS.surface, borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-3">
                <CheckCircle size={18} style={{ color: task.done ? COLORS.teal : COLORS.muted }} />
                <span
                  style={{
                    color: task.done ? COLORS.muted : COLORS.ivory,
                    textDecoration: task.done ? "line-through" : "none",
                  }}
                >
                  {task.title}
                </span>
              </div>
              {task.done ? (
                <span className="text-[11px] font-bold" style={{ color: COLORS.teal }}>
                  Accompli
                </span>
              ) : (
                <button
                  onClick={() => handleCompleteTask(task)}
                  className="px-3 py-1 rounded-lg font-bold border hover:border-amber-400 transition"
                  style={{
                    background: COLORS.surface2,
                    borderColor: COLORS.borderGold,
                    color: COLORS.gold,
                    opacity: isAnonymous || remainingToday <= 0 ? 0.55 : 1,
                  }}
                >
                  +{task.pts} pts
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Journal */}
      <div
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.borderGold }}
      >
        <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
          <Clock size={18} />
          Journal des points
        </h3>
        <div className="flex flex-col gap-2">
          {pointsLog.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: COLORS.muted }}>
              Aucune transaction récente
            </p>
          ) : (
            pointsLog.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl border flex items-center justify-between text-xs"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: COLORS.goldGlow, color: COLORS.gold }}
                  >
                    <Coins size={16} />
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: COLORS.ivory }}>{log.type}</div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>{log.date}</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-xs" style={{ color: COLORS.gold }}>{log.change}</div>
                  <div className="text-[10px]" style={{ color: COLORS.teal }}>{log.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
