import { useState } from "react";
import {
  Coins,
  TrendingUp,
  ArrowRightLeft,
  Zap,
  Download,
  QrCode,
  Copy,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { useApp } from "../contexts/AppContext.jsx";

const PRICE_HISTORY = [
  { t: "J-6", price: 0.82 },
  { t: "J-5", price: 0.88 },
  { t: "J-4", price: 0.85 },
  { t: "J-3", price: 0.94 },
  { t: "J-2", price: 1.02 },
  { t: "J-1", price: 0.98 },
  { t: "Auj.", price: 1.06 },
];

export function CryptoTab() {
  const { pointsBalance, baroBalance, convertToBaro } = useApp();
  const { showToast } = useToast();
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("100");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);

  const POINTS_PER_BARO = 100;
  const BARO_USD = 1.06;
  const walletAddress = "0xBAARO...MAINNET";

  const handleSwap = async (e) => {
    e.preventDefault();
    const val = parseFloat(amountInput);
    if (isNaN(val) || val <= 0) {
      showToast("Montant invalide", "error");
      return;
    }

    if (val > pointsBalance) {
      showToast("Solde de points insuffisant", "error");
      return;
    }

    if (val % 1 !== 0) {
      showToast("Utilisez un nombre entier de points", "error");
      return;
    }

    setLoading(true);
    const result = await convertToBaro(Math.floor(val));
    setLoading(false);

    if (result.ok) {
      const baroEarned = val / POINTS_PER_BARO;
      setTransactions((prev) => [
        {
          id: `tx_${Date.now()}`,
          type: `Conversion ${val} pts → ${baroEarned.toFixed(2)} BARO`,
          amount: `+${baroEarned.toFixed(2)} BARO`,
          date: "À l'instant",
          status: "Confirmé",
        },
        ...prev,
      ]);
      showToast(`Conversion réussie ! +${baroEarned.toFixed(2)} BARO`, "success");
      setExchangeModalOpen(false);
    } else {
      showToast(result.error || "Échec de la conversion", "error");
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    showToast("Adresse copiée !", "success");
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      {/* Hero BARO */}
      <div
        className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden teal-glow"
        style={{
          borderColor: COLORS.borderTeal,
          background:
            "linear-gradient(135deg, rgba(17,26,44,0.95) 0%, rgba(45,191,166,0.15) 100%)",
        }}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs uppercase tracking-widest font-mono"
                style={{ color: COLORS.muted }}
              >
                Solde BARO Coin
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                style={{ background: COLORS.tealGlow, color: COLORS.teal }}
              >
                Mainnet v1
              </span>
            </div>
            <h2 className="text-4xl font-extrabold font-mono text-gradient-teal mt-1">
              {Number(baroBalance).toFixed(2)}{" "}
              <span
                className="text-xl font-sans font-normal"
                style={{ color: COLORS.ivory }}
              >
                BARO
              </span>
            </h2>
            <div className="text-xs mt-1 font-mono" style={{ color: COLORS.muted }}>
              ≈ ${(Number(baroBalance) * BARO_USD).toFixed(2)} USD • 1 BARO = $
              {BARO_USD}
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={() => setQrModalOpen(true)}
              className="p-3 rounded-2xl border hover:border-amber-400 transition"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            >
              <QrCode size={20} />
            </button>

            <button
              onClick={() => setExchangeModalOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold shadow-xl transition gold-glow"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <ArrowRightLeft size={16} />
              <span>Convertir Points → BARO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Graphique + Staking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col gap-4"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                Évolution du BARO Coin
              </h3>
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: COLORS.teal }}
              >
                <TrendingUp size={14} />
                <span>+8.16% sur 7 jours</span>
              </div>
            </div>
            <span
              className="text-xs px-2.5 py-1 rounded-lg border font-mono"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.gold,
              }}
            >
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
                <XAxis
                  dataKey="t"
                  stroke={COLORS.muted}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke={COLORS.muted}
                  fontSize={11}
                  tickLine={false}
                  domain={["dataMin - 0.1", "dataMax + 0.1"]}
                />
                <Tooltip
                  contentStyle={{
                    background: COLORS.surface2,
                    borderColor: COLORS.borderTeal,
                    borderRadius: "12px",
                    color: COLORS.ivory,
                  }}
                  formatter={(value) => [`$${value}`, "Prix BARO"]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#2DBFA6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#baroGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="glass-card rounded-2xl p-5 border flex flex-col justify-between gap-4"
          style={{ borderColor: COLORS.borderGold }}
        >
          <div>
            <div
              className="flex items-center gap-2 text-xs font-bold"
              style={{ color: COLORS.gold }}
            >
              <Zap size={16} />
              <span>Staking BAARO Vault</span>
            </div>
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: COLORS.muted }}
            >
              Bloquez vos BARO pendant 30 jours et gagnez un rendement estimé de{" "}
              <strong style={{ color: COLORS.teal }}>+12% APR</strong>.
            </p>
          </div>

          <button
            onClick={() =>
              showToast("Staking bientôt disponible", "info")
            }
            className="w-full py-2.5 rounded-xl text-xs font-bold border transition hover:border-amber-400"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.borderGold,
              color: COLORS.gold,
            }}
          >
            Déposer au Vault
          </button>
        </div>
      </div>

      {/* Historique */}
      <div
        className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>
            Historique des conversions
          </h3>
          <button
            onClick={() => showToast("Export bientôt disponible", "info")}
            className="flex items-center gap-1 text-xs"
            style={{ color: COLORS.teal }}
          >
            <Download size={14} />
            <span>Exporter</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {transactions.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: COLORS.muted }}>
              Aucune conversion récente
            </p>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3 rounded-xl border flex items-center justify-between text-xs"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: COLORS.tealGlow, color: COLORS.teal }}
                  >
                    <Coins size={16} />
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: COLORS.ivory }}>
                      {tx.type}
                    </div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>
                      {tx.date}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-mono font-bold"
                    style={{ color: COLORS.teal }}
                  >
                    {tx.amount}
                  </div>
                  <div className="text-[10px]" style={{ color: COLORS.teal }}>
                    {tx.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal QR */}
      {qrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm glass-card rounded-3xl p-6 border shadow-2xl flex flex-col items-center gap-5 text-center"
            style={{ borderColor: COLORS.borderTeal }}
          >
            <div className="flex justify-between items-center w-full">
              <h3 className="text-base font-bold text-gradient-teal">
                Recevoir des BARO
              </h3>
              <button onClick={() => setQrModalOpen(false)} style={{ color: COLORS.muted }}>
                <X size={18} />
              </button>
            </div>

            <div
              className="w-48 h-48 rounded-2xl bg-white p-3 flex items-center justify-center shadow-2xl border-4"
              style={{ borderColor: COLORS.teal }}
            >
              <div className="w-full h-full border-4 border-dashed border-slate-900 flex flex-col items-center justify-center gap-1 text-slate-900">
                <QrCode size={64} />
                <span className="text-[10px] font-mono font-bold">BAARO</span>
              </div>
            </div>

            <div
              className="w-full p-3 rounded-xl border flex justify-between items-center font-mono text-xs"
              style={{ background: COLORS.surface, borderColor: COLORS.border }}
            >
              <span style={{ color: COLORS.gold }}>{walletAddress}</span>
              <button
                onClick={copyAddress}
                className="p-1 rounded hover:bg-white/5"
                style={{ color: COLORS.teal }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal conversion */}
      {exchangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className="w-full max-w-md glass-card rounded-3xl p-6 border shadow-2xl flex flex-col gap-5"
            style={{ borderColor: COLORS.borderGold }}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gradient-gold">
                Convertir en BARO
              </h3>
              <button
                onClick={() => setExchangeModalOpen(false)}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: COLORS.border, color: COLORS.muted }}
              >
                Fermer
              </button>
            </div>

            <form onSubmit={handleSwap} className="flex flex-col gap-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: COLORS.muted }}>
                  Points à convertir (solde : {pointsBalance})
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none text-sm font-mono"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
              </div>

              <div
                className="p-3 rounded-xl text-xs"
                style={{ background: COLORS.surface, color: COLORS.muted }}
              >
                Vous recevrez environ{" "}
                <strong style={{ color: COLORS.teal }}>
                  {(parseFloat(amountInput || 0) / POINTS_PER_BARO).toFixed(2)} BARO
                </strong>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
                  color: COLORS.bg,
                }}
              >
                {loading ? "Conversion..." : "Confirmer la conversion"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
