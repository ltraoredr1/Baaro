import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "./slices/uiSlice";
import walletReducer from "./slices/walletSlice";

/**
 * Store Redux BAARO
 * Tourne EN PARALLÈLE avec AppContext + React Query.
 *
 * - ui     → onglet actif, modals, drawer
 * - wallet → soldes points / BARO (côté client)
 *
 * Auth / session reste dans AppContext.
 */
export const store = configureStore({
  reducer: {
    ui: uiReducer,
    wallet: walletReducer,
  },
  devTools: import.meta.env.DEV,
});
