import { useState } from "react";
import {
  Coins,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  QrCode,
  Copy,
  X,
  Lock
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

const PRICE_HISTORY = [
  { t: "J-6", price: 0.82 },
  { t: "J-5", price: 0.88 },
  { t: "J-4", price: 0.85 },
  { t: "J-3", price: 0.94 },
  { t: "J-2", price: 1.02 },
  { t: "J-1", price: 0.98 },
  { t: "Auj.", price: 1.06 },
];

const DEMO_TXS = [
  { id: "tx1", type: "Conversion Points -> BARO", amount: "+1.20 BARO", date: "Aujourd'hui, 14:10", status: "Confirmé" },
  { id: "tx2", type: "Pourboire vidéo reçu", amount: "+0.50 BARO", date: "Hier, 18:30", status: "Confirmé" },
  { id: "tx3", type: "Achat de pass Pro", amount: "-0.80 BARO", date: "28 Juillet", status: "Confirmé" },
];

export function CryptoTab({ pointsBalance, baroBalance, onRewardPoints, setBaroBalance, setPointsBalance }) {
  const { showToast, showPointsReward } = useToast();
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [swapMode, setSwapMode] = useState("pointsToBaro");
  const [amountInput, setAmountInput] = useState("100");
  const [transactions, setTransactions] = useState(DEMO_TXS);
  const walletAddress = "0x7F9B2A8C1094D31E56B2";

  const POINTS_PER_BARO = 100;
  const BARO_USD = 1.06;

  const handleSwap = (e) => {
    e.preventDefault();
    const val = parseFloat(amountInput);
    if (isNaN(val) || val <= 0) return;

    if (swapMode === "pointsToBaro") {
      if (val > pointsBalance) {
        showToast("Solde de points insuffisant", "error");
        return;
      }
      const baroEarned = val / POINTS_PER_BARO;
      setPointsBalance((prev) => prev - val);
      setBaroBalance((prev) => prev + baroEarned);

      const newTx = {
        id: `tx_${Date.now()}`,
        type: `Échange ${val} pts -> ${baroEarned.toFixed(2)} BARO`,
        amount: `+${baroEarned.toFixed(2)} BARO`,
        date: "À l'instant",
        status: "Confirmé"
      };
      setTransactions([newTx, ...transactions]);
      showToast(`Conversion réussie ! +${baroEarned.toFixed(2)} BARO Coin reçus.`, "success");
    } else {
      if (val > baroBalance) {
        showToast("Solde de BARO Coin insuffisant", "error");
        return;
      }
      const ptsEarned = val * POINTS_PER_BARO;
      setBaroBalance((prev) => prev - val);
      setPointsBalance((prev) => prev + ptsEarned);

      const newTx = {
        id: `tx_${Date.now()}`,
        type: `Échange ${val} BARO -> ${ptsEarned} pts`,
        amount: `-${val.toFixed(2)} BARO`,
        date: "À l'instant",
        status: "Confirmé"
      };
      setTransactions([newTx, ...transactions]);
      showToast(`Conversion réussie ! +${ptsEarned} Points réseau reçus.`, "success");
    }

    setExchangeModalOpen(false);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    showToast("Adresse de portefeuille copiée !", "success");
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      {/* Crypto Hero Card */}
      <div className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden teal-glow" style={{ borderColor: COLORS.borderTeal, background: "linear-gradient(135deg, rgba(17,26,44,0.95) 0%, rgba(45,191,166,0.15) 100%)" }}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-mono" style={{ color: COLORS.muted }}>Solde BARO Coin</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>Mainnet v1</span>
            </div>
            <h2 className="text-4xl font-extrabold font-mono text-gradient-teal mt-1">
              {baroBalance.toFixed(2)} <span className="text-xl font-sans font-normal" style={{ color: COLORS.ivory }}>BARO</span>
            </h2>
            <div className="text-xs mt-1 font-mono" style={{ color: COLORS.muted }}>
              ≈ ${(baroBalance * BARO_USD).toFixed(2)} USD • 1 BARO = ${BARO_USD} USD
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={() => setQrModalOpen(true)}
              className="p-3 rounded-2xl border hover:border-amber-400 transition glass-panel"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              title="QR Code Portefeuille"
            >
              <QrCode size={20} />
            </button>

            <button
              onClick={() => {
                setSwapMode("pointsToBaro");
                setExchangeModalOpen(true);
              }}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold shadow-xl transition gold-glow"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <ArrowRightLeft size={16} />
              <span>Convertir Points ↔ BARO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Price History Chart & Market Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Chart */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.border }}>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Évolution du BARO Coin</h3>
              <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.teal }}>
                <TrendingUp size={14} />
                <span>+8.16% sur 7 jours</span>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg border font-mono" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.gold }}>
              1 BARO = 100 PTS
            </span>
          </div>

          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PRICE_HISTORY}>
                <defs>
                  <linearGradient id="baroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2DBFA6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2DBFA6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" stroke={COLORS.muted} fontSize={11} tickLine={false} />
                <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} domain={['dataMin - 0.1', 'dataMax + 0.1']} />
                <Tooltip
                  contentStyle={{ background: COLORS.surface2, borderColor: COLORS.borderTeal, borderRadius: "12px", color: COLORS.ivory }}
                  formatter={(value) => [`$${value}`, "Prix BARO"]}
                />
                <Area type="monotone" dataKey="price" stroke="#2DBFA6" strokeWidth={3} fillOpacity={1} fill="url(#baroGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Staking & Earn Info */}
        <div className="glass-card rounded-2xl p-5 border flex flex-col justify-between gap-4" style={{ borderColor: COLORS.borderGold }}>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: COLORS.gold }}>
              <Zap size={16} />
              <span>Staking BAARO Vault</span>
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: COLORS.muted }}>
              Bloquez vos BARO Coins pendant 30 jours et gagnez un rendement estimé de <strong style={{ color: COLORS.teal }}>+12% APR</strong>.
            </p>
          </div>

          <div className="p-3 rounded-xl border flex flex-col gap-1" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <span className="text-[10px] uppercase font-mono" style={{ color: COLORS.muted }}>Rendement Réseau Estimé</span>
            <span className="text-base font-bold font-mono" style={{ color: COLORS.gold }}>+0.24 BARO / mois</span>
          </div>

          <button
            onClick={() => showToast("Fonctionnalité Staking Vault bientôt disponible sur le Mainnet !", "info")}
            className="w-full py-2.5 rounded-xl text-xs font-bold border transition hover:border-amber-400"
            style={{ background: COLORS.surface2, borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            Déposer au Vault
          </button>
        </div>
      </div>

      {/* Transaction History Log */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.border }}>
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Historique des Transactions Crypto</h3>
          <button onClick={() => showToast("Export CSV généré", "success")} className="flex items-center gap-1 text-xs" style={{ color: COLORS.teal }}>
            <Download size={14} />
            <span>Exporter CSV</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
                  <Coins size={16} />
                </div>
                <div>
                  <div className="font-bold" style={{ color: COLORS.ivory }}>{tx.type}</div>
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>{tx.date}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono font-bold" style={{ color: tx.amount.startsWith("+") ? COLORS.teal : COLORS.gold }}>
                  {tx.amount}
                </div>
                <div className="text-[10px]" style={{ color: COLORS.teal }}>{tx.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code & Wallet Address Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setQrModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm glass-card rounded-3xl p-6 border shadow-2xl flex flex-col items-center gap-5 text-center" style={{ borderColor: COLORS.borderTeal }}>
            <div className="flex justify-between items-center w-full">
              <h3 className="text-base font-bold text-gradient-teal">Recevoir des BARO Coins</h3>
              <button onClick={() => setQrModalOpen(false)} style={{ color: COLORS.muted }}><X size={18} /></button>
            </div>

            {/* QR Code Simulator Box */}
            <div className="w-48 h-48 rounded-2xl bg-white p-3 flex items-center justify-center shadow-2xl border-4" style={{ borderColor: COLORS.teal }}>
              <div className="w-full h-full border-4 border-dashed border-slate-900 flex flex-col items-center justify-center gap-1 text-slate-900">
                <QrCode size={64} />
                <span className="text-[10px] font-mono font-bold">BAARO-P2P-MAINNET</span>
              </div>
            </div>

            {/* Address Pill */}
            <div className="w-full p-3 rounded-xl border flex justify-between items-center font-mono text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <span style={{ color: COLORS.gold }}>{walletAddress}</span>
              <button onClick={copyAddress} className="p-1 rounded hover:bg-white/5" style={{ color: COLORS.teal }}>
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Swap Modal */}
      {exchangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md glass-card rounded-3xl p-6 border shadow-2xl flex flex-col gap-5" style={{ borderColor: COLORS.borderGold }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gradient-gold">Échanger vos Jetons</h3>
              <button onClick={() => setExchangeModalOpen(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: COLORS.border, color: COLORS.muted }}>Fermer</button>
            </div>

            {/* Toggle Mode */}
            <div className="flex rounded-xl p-1 border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
              <button
                type="button"
                onClick={() => setSwapMode("pointsToBaro")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${swapMode === "pointsToBaro" ? "shadow-md" : ""}`}
                style={{
                  background: swapMode === "pointsToBaro" ? COLORS.gold : "transparent",
                  color: swapMode === "pointsToBaro" ? COLORS.bg : COLORS.muted
                }}
              >
                Points ➔ BARO Coin
              </button>
              <button
                type="button"
                onClick={() => setSwapMode("baroToPoints")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${swapMode === "baroToPoints" ? "shadow-md" : ""}`}
                style={{
                  background: swapMode === "baroToPoints" ? COLORS.teal : "transparent",
                  color: swapMode === "baroToPoints" ? COLORS.bg : COLORS.muted
                }}
              >
                BARO Coin ➔ Points
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSwap} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: COLORS.muted }}>
                  {swapMode === "pointsToBaro" ? `Montant en Points (Disponible: ${pointsBalance} pts)` : `Montant en BARO Coin (Disponible: ${baroBalance.toFixed(2)} BARO)`}
                </label>
                <input
                  type="number"
                  step="any"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full bg-transparent border rounded-xl p-3 text-sm font-mono outline-none"
                  style={{ borderColor: COLORS.borderGold, color: COLORS.ivory }}
                />
              </div>

              {/* Conversion Result Preview */}
              <div className="p-3 rounded-xl border flex justify-between items-center text-xs" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
                <span style={{ color: COLORS.muted }}>Vous recevrez :</span>
                <span className="font-mono font-bold text-sm" style={{ color: COLORS.teal }}>
                  {swapMode === "pointsToBaro"
                    ? `${((parseFloat(amountInput) || 0) / POINTS_PER_BARO).toFixed(2)} BARO`
                    : `${((parseFloat(amountInput) || 0) * POINTS_PER_BARO).toFixed(0)} Points`}
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl text-xs font-bold shadow-xl transition gold-glow"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                Confirmer l'échange instantané
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
