import { useState, useEffect } from "react";
import { Share2, Copy, Users, Gift } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { useApp } from "../contexts/AppContext.jsx";
import {
  getMyReferralCode,
  applyReferralCode,
  getPendingRef,
  clearPendingRef,
} from "../lib/referralApi.js";

/**
 * Section parrainage pour WalletTab (ou Settings).
 * - Affiche code + lien + stats
 * - Champ pour saisir un code (si pas encore parrainé)
 * - Applique auto le ?ref= de l'URL si présent
 */
export function ReferralSection({ onPointsUpdated }) {
  const { isAnonymous, refreshWalletStatus } = useApp();
  const { showToast } = useToast();
  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ count: 0, totalPts: 0 });
  const [loading, setLoading] = useState(true);
  const [inputCode, setInputCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [alreadyReferred, setAlreadyReferred] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await getMyReferralCode();
    if (res.ok) {
      setCode(res.code || null);
      setLink(res.link || null);
      setStats(res.stats || { count: 0, totalPts: 0 });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Appliquer auto un code capturé depuis l'URL
  useEffect(() => {
    if (isAnonymous) return;
    const pending = getPendingRef();
    if (!pending) return;

    (async () => {
      setApplying(true);
      const res = await applyReferralCode(pending);
      setApplying(false);
      if (res.ok) {
        clearPendingRef();
        setAlreadyReferred(true);
        showToast(res.message || `+${res.ptsEarned} pts parrainage !`, "success");
        await refreshWalletStatus?.();
        onPointsUpdated?.();
        load();
      } else if (res.error?.includes("déjà")) {
        clearPendingRef();
        setAlreadyReferred(true);
      }
      // sinon on laisse le code en pending pour saisie manuelle
    })();
  }, [isAnonymous]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copié !", "success");
  };

  const handleApply = async (e) => {
    e.preventDefault();
    if (!inputCode.trim() || applying) return;
    if (isAnonymous) {
      showToast("Créez un compte pour utiliser un code", "info");
      return;
    }
    setApplying(true);
    const res = await applyReferralCode(inputCode.trim());
    setApplying(false);
    if (res.ok) {
      setAlreadyReferred(true);
      clearPendingRef();
      showToast(res.message || "Code appliqué !", "success");
      await refreshWalletStatus?.();
      onPointsUpdated?.();
      load();
    } else {
      showToast(res.error || "Code invalide", "error");
      if (res.error?.includes("déjà")) setAlreadyReferred(true);
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-center py-4" style={{ color: COLORS.muted }}>
        Chargement du parrainage…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mon code */}
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
              {isAnonymous
                ? "Créez un compte pour inviter des amis"
                : "Invitez des amis : +25 pts pour vous, +15 pts pour eux"}
            </p>
          </div>
        </div>

        {!isAnonymous && code && (
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <div
              className="px-3 py-2 rounded-xl border font-mono text-xs font-bold"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.gold,
              }}
            >
              {code}
            </div>
            <button
              onClick={() => handleCopy(code)}
              className="p-2.5 rounded-xl border hover:border-amber-400 transition"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.borderGold,
                color: COLORS.gold,
              }}
              title="Copier le code"
            >
              <Copy size={16} />
            </button>
            {link && (
              <button
                onClick={() => handleCopy(link)}
                className="px-3 py-2 rounded-xl text-xs font-bold border transition"
                style={{
                  background: COLORS.surface2,
                  borderColor: COLORS.borderTeal,
                  color: COLORS.teal,
                }}
              >
                Copier le lien
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      {!isAnonymous && (
        <div className="flex gap-3">
          <div
            className="flex-1 p-3 rounded-xl border flex items-center gap-2"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <Users size={16} style={{ color: COLORS.teal }} />
            <div>
              <div className="text-[10px]" style={{ color: COLORS.muted }}>
                Filleuls
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: COLORS.ivory }}>
                {stats.count}
              </div>
            </div>
          </div>
          <div
            className="flex-1 p-3 rounded-xl border flex items-center gap-2"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <Gift size={16} style={{ color: COLORS.gold }} />
            <div>
              <div className="text-[10px]" style={{ color: COLORS.muted }}>
                Pts gagnés
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: COLORS.gold }}>
                {stats.totalPts}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saisir un code */}
      {!isAnonymous && !alreadyReferred && (
        <form
          onSubmit={handleApply}
          className="p-4 rounded-xl border flex flex-col sm:flex-row gap-2"
          style={{ background: COLORS.surface, borderColor: COLORS.border }}
        >
          <input
            type="text"
            placeholder="Code d'un ami (ex: BAARO-A7K2M9)"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none text-xs font-mono"
            style={{
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
            maxLength={20}
          />
          <button
            type="submit"
            disabled={applying || !inputCode.trim()}
            className="px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            {applying ? "…" : "Appliquer"}
          </button>
        </form>
      )}
    </div>
  );
}
