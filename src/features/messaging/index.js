/**
 * src/features/messaging/index.js - barrel
 * Fix build: n'exporte que les fichiers qui existent réellement
 */
export { MessagesTab } from "./components/MessagesTab.jsx";
export { ChatCallModal } from "./components/ChatCallModal.jsx";

// Hooks existants
export { useMessaging } from "./hooks/useMessaging.js";
export { useCryptoKeys } from "./hooks/useCryptoKeys.js";

// Libs - vérifie que ces fichiers existent, sinon commente la ligne
export * from "./lib/crypto.js";
export * from "./lib/calls.js";
