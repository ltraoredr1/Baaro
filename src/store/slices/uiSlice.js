import { createSlice } from "@reduxjs/toolkit";

/**
 * État UI global BAARO
 * Onglet actif, drawers, modals, recherche…
 */
const initialState = {
  activeTab: "feed",
  notifDrawerOpen: false,
  searchModalOpen: false,
  inspectingProfileId: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
    openNotifDrawer(state) {
      state.notifDrawerOpen = true;
    },
    closeNotifDrawer(state) {
      state.notifDrawerOpen = false;
    },
    toggleNotifDrawer(state) {
      state.notifDrawerOpen = !state.notifDrawerOpen;
    },
    openSearchModal(state) {
      state.searchModalOpen = true;
    },
    closeSearchModal(state) {
      state.searchModalOpen = false;
    },
    setInspectingProfileId(state, action) {
      state.inspectingProfileId = action.payload;
    },
    resetUi(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
  setActiveTab,
  openNotifDrawer,
  closeNotifDrawer,
  toggleNotifDrawer,
  openSearchModal,
  closeSearchModal,
  setInspectingProfileId,
  resetUi,
} = uiSlice.actions;

export default uiSlice.reducer;
