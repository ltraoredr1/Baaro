import { useState } from "react";
import {
  Wallet,
  Gift,
  Share2,
  CheckCircle,
  Copy,
  TrendingUp,
  Award,
  Sparkles,
  Zap,
  Coins,
  ArrowRightLeft,
  Clock,
  CheckCircle2
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

const INITIAL_POINTS_LOG = [
  { id: "l1", type: "Publication créée", change: "+15 pts", date: "Aujourd'hui, 15:30", status: "Accrédité" },
  { id: "l2", type: "Bonus quotidien", change: "+10 pts", date: "Aujourd'hui, 09:12", status: "Accrédité" },
  { id: "l3", type: "Vote arène de débat", change: "+5 pts", date: "Hier, 19:40", status: "Accrédité" },
  { id: "l4", type: "Parrainage validé (@kenji_tokyo)", change: "+20 pts", date: "28 Juillet", status: "Accrédité" },
  { id: "l5", type: "Conversion vers BARO Coin", change: "-100 pts", date: "26 Juillet", status: "Déduit" },
];

const DAILY_TASKS = [
  { id: "t1", title: "Publier une pensée ou un article", pts: "+15 pts", done: false },
  { id: "t2", title: "Donner 3 J'aime dans le fil d'actualité", pts: "+6 pts", done: true },
  { id: "t3", title: "Poser une question à l'assistant IA", pts: "+5 pts", done: false },
  { id: "t4", title: "Participer à un débat communautaire", pts: "+10 pts", done: false },
];

export function WalletTab({ pointsBalance, baroBalance, onRewardPoints, onNavigateToCrypto }) {
  const { showToast, showPointsReward } = useToast();
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [referralCode] = useState("BAARO-REF-8921");
  const [tasks, setTasks] = useState(DAILY_TASKS);
  const [pointsLog, setPointsLog] = useState(INITIAL_POINTS_LOG);

  const handleClaimDaily = () => {
    if (dailyClaimed) return;
    setDailyClaimed(true);
    onRewardPoints(10);
    showPointsReward(10, "Bonus quotidien réclamé !");

    const newLogItem = {
      id: `l_${Date.now()}`,
      type: "Bonus quotidien réclamé",
      change: "+10 pts",
      date: "À l'instant",
      status: "Accrédité"
    };
    setPointsLog([newLogItem, ...pointsLog]);
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(`https://baaro.app/register?ref=${referralCode}`);
    showToast("Lien de parrainage copié dans le presse-papier !", "success");
  };

  const handleCompleteTask = (taskId, ptsVal) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, done: true } : t))
    );
    const num = parseInt(ptsVal) || 5;
    onRewardPoints(num);
    showPointsReward(num, "Tâche quotidienne accomplie");

    const newLogItem = {
      id: `l_${Date.now()}`,
      type: `Mission : ${ptsVal}`,
      change: `+${num} pts`,
      date: "À l'instant",
      status: "Accrédité"
    };
    setPointsLog([newLogItem, ...pointsLog]);
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-20">
      {/* Wallet Balance Hero Card */}
      <div className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden gold-glow" style={{ borderColor: COLORS.borderGold, background: "linear-gradient(135deg, rgba(26,39,64,0.9) 0%, rgba(217,174,82,0.15) 100%)" }}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <span className="text-xs uppercase tracking-widest font-mono" style={{ color: COLORS.muted }}>Solde Réseau Mondial</span>
            <h2 className="text-4xl font-extrabold font-mono text-gradient-gold mt-1">
              {pointsBalance} <span className="text-xl font-sans font-normal" style={{ color: COLORS.ivory }}>pts</span>
            </h2>
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: COLORS.teal }}>
              <Zap size={14} />
              <span>Niveau 3 • Créateur Émergent</span>
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
              <span>{dailyClaimed ? "Bonus Réclamé" : "Réclamer Bonus (+10 pts)"}</span>
            </button>

            <button
              onClick={onNavigateToCrypto}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border hover:border-teal-400 transition"
              style={{ background: COLORS.surface2, borderColor: COLORS.borderTeal, color: COLORS.teal }}
            >
              <ArrowRightLeft size={16} />
              <span>Convertir en BARO</span>
            </button>
          </div>
        </div>

        {/* Level Progression Bar */}
        <div className="mt-6 pt-4 border-t flex flex-col gap-1.5" style={{ borderColor: COLORS.border }}>
          <div className="flex justify-between text-xs font-medium" style={{ color: COLORS.muted }}>
            <span>Progression du Niveau 3</span>
            <span>{pointsBalance} / 500 pts</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (pointsBalance / 500) * 100)}%`, background: "linear-gradient(90deg, #D9AE52 0%, #2DBFA6 100%)" }} />
          </div>
        </div>
      </div>

      {/* Referral Banner */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderColor: COLORS.borderTeal }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold teal-glow" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
            <Share2 size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Programme de Parrainage</h3>
            <p className="text-xs" style={{ color: COLORS.muted }}>Gagnez 20 points pour chaque ami invité sur BAARO !</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="px-3 py-2 rounded-xl border font-mono text-xs font-bold" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.gold }}>
            {referralCode}
          </div>
          <button
            onClick={handleCopyReferral}
            className="p-2.5 rounded-xl border hover:border-amber-400 transition"
            style={{ background: COLORS.surface2, borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      {/* Daily Tasks Checklist */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gradient-gold">Missions Quotidiennes</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>Reset à minuit</span>
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
                <span style={{ color: task.done ? COLORS.muted : COLORS.ivory, textDecoration: task.done ? "line-through" : "none" }}>
                  {task.title}
                </span>
              </div>

              {task.done ? (
                <span className="text-[11px] font-bold" style={{ color: COLORS.teal }}>Accompli</span>
              ) : (
                <button
                  onClick={() => handleCompleteTask(task.id, task.pts)}
                  className="px-3 py-1 rounded-lg font-bold border hover:border-amber-400 transition"
                  style={{ background: COLORS.surface2, borderColor: COLORS.borderGold, color: COLORS.gold }}
                >
                  Faire ({task.pts})
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Points Audit Trail Log Table */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.borderGold }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
            <Clock size={18} />
            Journal Historique des Points
          </h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
            Relevé Réseau
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {pointsLog.map((log) => (
            <div key={log.id} className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs" style={{ background: log.change.startsWith("+") ? COLORS.goldGlow : "rgba(236,72,153,0.15)", color: log.change.startsWith("+") ? COLORS.gold : "#EC4899" }}>
                  <Coins size={16} />
                </div>
                <div>
                  <div className="font-bold" style={{ color: COLORS.ivory }}>{log.type}</div>
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>{log.date}</div>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="font-bold text-xs" style={{ color: log.change.startsWith("+") ? COLORS.gold : "#EC4899" }}>
                  {log.change}
                </div>
                <div className="text-[10px]" style={{ color: COLORS.teal }}>{log.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
