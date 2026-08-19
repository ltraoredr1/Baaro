import { useEffect, useRef } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import {
  applyReferralCode,
  getPendingRef,
  clearPendingRef,
} from "../lib/referralApi.js";

/**
 * Applique automatiquement le code ?ref= stocké dès que l'utilisateur
 * a un compte non-anonyme. À monter une seule fois dans l'app (ex. MainAppContent).
 */
export function useApplyPendingReferral({ showToast } = {}) {
  const { isAnonymous, session, refreshWalletStatus } = useApp();
  const tried = useRef(false);

  useEffect(() => {
    if (!session?.user || isAnonymous || tried.current) return;

    const pending = getPendingRef();
    if (!pending) return;

    tried.current = true;

    (async () => {
      const res = await applyReferralCode(pending);
      if (res.ok) {
        clearPendingRef();
        showToast?.(res.message || `Parrainage : +${res.ptsEarned} pts`, "success");
        await refreshWalletStatus?.();
      } else if (
        res.error?.includes("déjà") ||
        res.error?.includes("propre code")
      ) {
        clearPendingRef();
      }
      // Sinon on garde le pending pour saisie manuelle dans Wallet
    })();
  }, [session, isAnonymous, refreshWalletStatus, showToast]);
}
