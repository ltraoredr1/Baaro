/**
 * src/features/messaging/index.js - barrel
 * Fix build: n'exporte que les fichiers qui existent réellement
 */
export { MessagesTab } from "./components/MessagesTab.jsx";
export { ChatInput } from "./components/ChatInput.jsx";
export { MessageBubble } from "./components/MessageBubble.jsx";
export { ChatCallModal } from "./components/ChatCallModal.jsx";

// Hooks existants
export { useMessaging } from "./hooks/useMessaging.js";
export { useCryptoKeys } from "./hooks/useCryptoKeys.js";

// Libs - vérifie que ces fichiers existent, sinon commente la ligne
export * from "./lib/crypto.js";
// export * from "./lib/calls.js"; // Commenté car le fichier n'existe pas
