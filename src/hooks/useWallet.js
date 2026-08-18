import { useApp } from "../contexts/AppContext.jsx";

/**
 * Hook pratique pour accéder au portefeuille BAARO.
 * Utilise le contexte global (source unique de vérité).
 *
 * Usage :
 *   const { pointsBalance, earnPoints, convertToBaro } = useWallet();
 */
export function useWallet() {
  const {
    pointsBalance,
    baroBalance,
    earnPoints,
    redeemReward,
    convertToBaro,
    setPointsBalance,
    setBaroBalance,
    isAnonymous,
  } = useApp();

  return {
    pointsBalance,
    baroBalance,
    earnPoints,
    redeemReward,
    convertToBaro,
    setPointsBalance,
    setBaroBalance,
    isAnonymous,
  };
}
