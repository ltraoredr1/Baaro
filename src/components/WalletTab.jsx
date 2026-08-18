import { useState } from "react";
import {
  Gift,
  Share2,
  CheckCircle,
  Copy,
  Zap,
  Coins,
  ArrowRightLeft,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { useWallet } from "../hooks/useWallet.js";
import { GuestBanner } from "./GuestBanner.jsx";

const DAILY_TASKS = [
  { id: "t1", title: "Publier une pensée ou un article", pts: 5, actionKey: "publish_post", done: false },
  { id: "t2", title: "Donner un J'aime dans le fil", pts: 2, actionKey: "like_post", done: false },
  { id: "t3", title: "Ajouter un commentaire", pts: 1, actionKey: "comment", done: false },
  { id: "t4", title: "Participer à un débat", pts: 5, actionKey: null, done: false },
];

export function WalletTab({ onNavigateToCrypto }) {
  const { pointsBalance, baroBalance, earnPoints, isAnonymous } = useWallet();
  const { showToast, showPointsReward } = useToast();
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [referralCode] = useState("BAARO-REF-8921");
  const [tasks, setTasks] = useState(DAILY_TASKS);
  const [pointsLog, setPointsLog] = useState([]);

  const handleClaimDaily = async () => {
    if (dailyClaimed) return;
    if (isAnonymous) {
      showToast("Créez un compte pour réclamer le bonus quotidien", "info");
      return;
    }
    setDailyClaimed(true);
    showToast("Bonus quotidien bientôt disponible côté serveur", "info");
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(`https://baaro.app/register?ref=${referralCode}`);
    showToast("Lien de parrainage copié !", "success");
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
              <span
                className="text-xl font-sans font-normal"
                style={{ color: COLORS.ivory }}
              >
                pts
              </span>
            </h2>
            <div
              className="flex items-center gap-2 mt-2 text-xs"
              style={{ color: COLORS.teal }}
            >
              <Zap size={14} />
              <span>BARO : {Number(baroBalance).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button
              onClick={handleClaimDaily}
              disabled={dailyClaimed}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-50"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Gift size={16} />
              <span>
                {dailyClaimed ? "Bonus Réclamé" : "Réclamer Bonus (+10 pts)"}
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

        <div
          className="mt-6 pt-4 border-t flex flex-col gap-1.5"
          style={{ borderColor: COLORS.border }}
        >
          <div
            className="flex justify-between text-xs font-medium"
            style={{ color: COLORS.muted }}
          >
            <span>Progression</span>
            <span>{pointsBalance} / 500 pts</span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: COLORS.surface }}
          >
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

      {/* Parrainage */}
      <div
        className="glass-card rounded-2xl p-5 border flex flex-col md:flex-row justify-between items-center gap-4"
        style={{ borderColor: COLORS.borderTeal }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center teal-glow"
            style={{ background: COLORS.tealGlow, color: COLORS.teal }}
          >
            <Share2 size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>
              Programme de Parrainage
            </h3>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Gagnez des points pour chaque ami invité
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div
            className="px-3 py-2 rounded-xl border font-mono text-xs font-bold"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.gold,
            }}
          >
            {referralCode}
          </div>
          <button
            onClick={handleCopyReferral}
            className="p-2.5 rounded-xl border hover:border-amber-400 transition"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.borderGold,
              color: COLORS.gold,
            }}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      {/* Missions */}
      <div
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gradient-gold">
            Missions Quotidiennes
          </h3>
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
                <CheckCircle
                  size={18}
                  style={{ color: task.done ? COLORS.teal : COLORS.muted }}
                />
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
                    opacity: isAnonymous ? 0.6 : 1,
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
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
            <Clock size={18} />
            Journal des points
          </h3>
        </div>

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
                    style={{
                      background: COLORS.goldGlow,
                      color: COLORS.gold,
                    }}
                  >
                    <Coins size={16} />
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: COLORS.ivory }}>
                      {log.type}
                    </div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>
                      {log.date}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-xs" style={{ color: COLORS.gold }}>
                    {log.change}
                  </div>
                  <div className="text-[10px]" style={{ color: COLORS.teal }}>
                    {log.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
