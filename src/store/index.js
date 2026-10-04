import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "./slices/uiSlice";

/**
 * Store Redux BAARO
 * Tourne EN PARALLÈLE avec AppContext + React Query.
 *
 * - ui     → onglet actif, modals, drawer
 *
 * Auth / session reste dans AppContext.
 */
export const store = configureStore({
  reducer: {
    ui: uiReducer,
  },
  devTools: import.meta.env.DEV,
});
