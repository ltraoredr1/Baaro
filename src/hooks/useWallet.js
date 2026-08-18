import { useApp } from "../contexts/AppContext.jsx";

/**
 * Hook pratique pour accéder au portefeuille BAARO.
 *
 * Usage :
 *   const { pointsBalance, remainingToday, earnPoints } = useWallet();
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
    earnedToday,
    remainingToday,
    dailyCap,
    refreshWalletStatus,
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
    earnedToday,
    remainingToday,
    dailyCap,
    refreshWalletStatus,
  };
}
