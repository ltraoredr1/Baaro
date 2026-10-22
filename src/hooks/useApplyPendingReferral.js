import { useEffect, useRef, useState, useCallback } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import {
  applyReferralCode,
  getPendingRef,
  clearPendingRef,
  setPendingRef, // utile si on veut forcer un code
} from "../lib/referralApi.js";

/**
 * Hook de parrainage automatique + manuel.
 *
 * Fonctionnalités :
 * - Applique automatiquement le code en attente (localStorage / URL)
 * - Permet d'appliquer manuellement un code
 * - Évite les doubles appels
 * - Expose un status clair
 * - Nettoie intelligemment les codes invalides/expirés
 */
export function useApplyPendingReferral({ showToast, auto = true } = {}) {
  const { isAnonymous, session } = useApp();

  const triedRef = useRef(new Set());
  const isRunningRef = useRef(false);

  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [lastResult, setLastResult] = useState(null); // { ok, message, ptsEarned, error }

  const userId = session?.user?.id;

  /**
   * Applique un code de parrainage
   * @param {string} [code] - Si omis, prend le code en attente (getPendingRef)
   * @param {object} [options]
   * @param {boolean} [options.force=false] - Ignore le cache "déjà tenté"
   * @param {boolean} [options.clearOnFail=true] - Nettoie le pending sur erreur définitive
   */
  const apply = useCallback(
    async (code, options = {}) => {
      const { force = false, clearOnFail = true } = options;

      if (!userId || isAnonymous) {
        return { ok: false, error: "Utilisateur non connecté" };
      }

      if (isRunningRef.current) {
        return { ok: false, error: "Déjà en cours" };
      }

      const raw = (code ?? getPendingRef() ?? "").trim().toUpperCase();
      if (!raw) {
        return { ok: false, error: "Aucun code fourni" };
      }

      // Formats acceptés : BAARO-XXXX ou GRP-XXXX
      if (!/^(BAARO|GRP)-[A-Z0-9]{4,}$/.test(raw)) {
        if (clearOnFail) clearPendingRef();
        const result = { ok: false, error: "Format de code invalide" };
        setLastResult(result);
        setStatus("error");
        return result;
      }

      const key = `\( {userId}: \){raw}`;
      if (!force && triedRef.current.has(key)) {
        return { ok: false, error: "Déjà tenté" };
      }

      triedRef.current.add(key);
      isRunningRef.current = true;
      setStatus("loading");

      try {
        const res = await applyReferralCode(raw);

        if (res?.ok) {
          clearPendingRef();
          const result = {
            ok: true,
            message: res.message || `Parrainage réussi : +${res.ptsEarned || res.bonus || 0} pts`,
            ptsEarned: res.ptsEarned || res.bonus || 0,
            code: raw,
          };
          setLastResult(result);
          setStatus("success");
          showToast?.(result.message, "success");
          return result;
        }

        // --- Gestion des erreurs métier ---
        const errorMsg = (res?.error || "").toLowerCase();
        const isDefinitive =
          /déjà|already|propre code|own code|expiré|expired|invalide|invalid|not found|introuvable/.test(
            errorMsg
          );

        if (isDefinitive && clearOnFail) {
          clearPendingRef();
        }

        // Messages plus humains
        let userMessage = res?.error || "Impossible d'appliquer le code";
        if (/propre code|own code/.test(errorMsg)) {
          userMessage = "Tu ne peux pas utiliser ton propre code";
        } else if (/déjà|already/.test(errorMsg)) {
          userMessage = "Ce code a déjà été utilisé";
        } else if (/expiré|expired/.test(errorMsg)) {
          userMessage = "Ce code a expiré";
        }

        const result = {
          ok: false,
          error: userMessage,
          code: raw,
          definitive: isDefinitive,
        };

        setLastResult(result);
        setStatus("error");

        // On n'affiche un toast que sur les cas vraiment utiles
        if (/propre code|own code/.test(errorMsg)) {
          showToast?.(userMessage, "info");
        }

        return result;
      } catch (err) {
        console.warn("[useApplyPendingReferral]", err);
        const result = {
          ok: false,
          error: "Erreur réseau ou serveur",
          code: raw,
        };
        setLastResult(result);
        setStatus("error");
        return result;
      } finally {
        isRunningRef.current = false;
      }
    },
    [userId, isAnonymous, showToast]
  );

  // Application automatique du code en attente
  useEffect(() => {
    if (!auto) return;
    if (!userId || isAnonymous) return;

    const pending = getPendingRef()?.trim();
    if (pending) {
      apply(pending);
    }
  }, [userId, isAnonymous, auto, apply]);

  /**
   * Force l'application d'un code (ignore le cache "déjà tenté")
   */
  const forceApply = useCallback(
    (code) => apply(code, { force: true }),
    [apply]
  );

  /**
   * Enregistre un code en attente (utile depuis une page d'invitation)
   */
  const setPending = useCallback((code) => {
    if (code) setPendingRef(code.trim().toUpperCase());
  }, []);

  /**
   * Réinitialise le status et le dernier résultat
   */
  const reset = useCallback(() => {
    setStatus("idle");
    setLastResult(null);
  }, []);

  return {
    // État
    status,          // "idle" | "loading" | "success" | "error"
    lastResult,      // dernier résultat détaillé
    isLoading: status === "loading",

    // Actions
    apply,           // apply(code?) → applique un code ou le pending
    forceApply,      // forceApply(code) → ignore le cache
    setPending,      // setPending(code) → stocke un code pour plus tard
    clearPending: clearPendingRef,
    reset,
  };
}
