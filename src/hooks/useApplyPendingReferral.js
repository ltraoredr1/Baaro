import { useEffect, useRef } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import { applyReferralCode, getPendingRef, clearPendingRef } from "../lib/referralApi.js";

export function useApplyPendingReferral({ showToast } = {}) {
  const { isAnonymous, session, refreshWalletStatus } = useApp();
  const tried = useRef(new Set()); // évite re-apply même si ?ref= change

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || isAnonymous) return;

    const pending = getPendingRef()?.trim().toUpperCase();
    if (!pending || tried.current.has(`${userId}:${pending}`)) return;

    // pending peut être BAARO-XXXX ou invite groupe/live
    if (!/^BAARO-|^GRP-/.test(pending)) return;

    tried.current.add(`${userId}:${pending}`);

    (async () => {
      try {
        const res = await applyReferralCode(pending); // POST /api/referral { action: "apply", code }
        if (res.ok) {
          clearPendingRef();
          showToast?.(res.message || `Parrainage : +${res.ptsEarned || res.bonus || 0} pts`, "success");
          await refreshWalletStatus?.();
        } else if (/déjà|propre code|expiré|invalide/i.test(res.error || "")) {
          // on nettoie pour ne pas bloquer l'UX Wallet
          clearPendingRef();
          if (/propre code/.test(res.error || "")) {
            showToast?.("Tu ne peux pas utiliser ton propre code", "info");
          }
        }
      } catch {}
    })();
  }, [session?.user?.id, isAnonymous, refreshWalletStatus, showToast]);
}
