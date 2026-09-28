import { createSlice } from "@reduxjs/toolkit";

/**
 * Soldes côté client BAARO
 * Les écritures réelles passent toujours par /api/wallet.
 * Ce slice sert d'affichage réactif + optimisme UI.
 */
const initialState = {
  pointsBalance: 0,
  baroBalance: 0,
  earnedToday: 0,
  remainingToday: 100,
  dailyCap: 100,
  loading: false,
};

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    setWallet(state, action) {
      const {
        pointsBalance,
        baroBalance,
        earnedToday,
        remainingToday,
        dailyCap,
      } = action.payload || {};

      if (pointsBalance != null) state.pointsBalance = pointsBalance;
      if (baroBalance != null) state.baroBalance = baroBalance;
      if (earnedToday != null) state.earnedToday = earnedToday;
      if (remainingToday != null) state.remainingToday = remainingToday;
      if (dailyCap != null) state.dailyCap = dailyCap;
    },
    setPoints(state, action) {
      state.pointsBalance = action.payload;
    },
    setBaro(state, action) {
      state.baroBalance = action.payload;
    },
    /** Mise à jour optimiste locale (+points) */
    earnLocal(state, action) {
      const amount = Number(action.payload) || 0;
      state.pointsBalance += amount;
      state.earnedToday += amount;
      state.remainingToday = Math.max(0, state.remainingToday - amount);
    },
    /** Mise à jour optimiste locale (-points) */
    spendLocal(state, action) {
      const amount = Number(action.payload) || 0;
      state.pointsBalance = Math.max(0, state.pointsBalance - amount);
    },
    setWalletLoading(state, action) {
      state.loading = !!action.payload;
    },
    resetWallet(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
  setWallet,
  setPoints,
  setBaro,
  earnLocal,
  spendLocal,
  setWalletLoading,
  resetWallet,
} = walletSlice.actions;

export default walletSlice.reducer;
